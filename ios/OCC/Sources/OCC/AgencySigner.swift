// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import CryptoKit
import Foundation
import LocalAuthentication

// MARK: - Types

/// Actor identity — a device-bound key that identifies WHO authorized a commitment.
public struct ActorIdentity: Codable, Sendable {
    /// Stable device key ID: hex(SHA-256(SPKI DER public key bytes)).
    public let keyId: String
    /// Base64 SPKI DER P-256 public key.
    public let publicKeyB64: String
    /// Signature algorithm the device used.
    public let algorithm: String  // "ES256"
    /// Key origin: "apple-secure-enclave".
    public let provider: String
}

/// The canonical payload that the actor's device signs.
/// Serialized as canonical JSON (sorted keys, compact, UTF-8) for signing.
/// When protocolVersion is present, it is included in the canonical JSON
/// and thus cryptographically bound to the signature.
public struct AuthorizationPayload: Codable, Sendable {
    public let actorKeyId: String
    public let artifactHash: String
    public let challenge: String
    public let protocolVersion: String?
    public let purpose: String  // "occ/commit-authorize/v1"
    public let timestamp: Int64
}

/// Full agency envelope — sent to the commit service.
public struct AgencyEnvelope: Codable, Sendable {
    public let actor: ActorIdentity
    public let authorization: Authorization

    public struct Authorization: Codable, Sendable {
        public let purpose: String
        public let actorKeyId: String
        public let artifactHash: String
        public let challenge: String
        public let protocolVersion: String?
        public let timestamp: Int64
        public let signatureB64: String
    }
}

/// Commit request sent to the OCC commit service.
public struct CommitRequest: Codable, Sendable {
    public let digests: [DigestEntry]
    public let metadata: [String: String]?
    public let agency: AgencyEnvelope?

    public struct DigestEntry: Codable, Sendable {
        public let digestB64: String
        public let hashAlg: String  // "sha256"
    }
}

// MARK: - AgencySigner

/// AgencySigner manages a device-bound P-256 key in the Secure Enclave
/// and produces agency envelopes for OCC proofs.
///
/// Flow:
///   1. `enroll()` — creates (or retrieves) a Secure Enclave P-256 key
///   2. `authorize(artifactHash:challenge:)` — Face ID → P-256 sign → AgencyEnvelope
///
/// The key is non-exportable and biometric-gated: every signing operation
/// requires Face ID / Touch ID authentication.
public final class AgencySigner: @unchecked Sendable {
    // MARK: - Constants

    private static let keychainTag = "com.occ.agency.device-key"
    private static let purpose = "occ/commit-authorize/v1"
    private static let provider = "apple-secure-enclave"
    private static let algorithm = "ES256"

    // MARK: - State

    /// The Secure Enclave P-256 private key (reference only — never leaves hardware).
    private var privateKey: SecureEnclave.P256.Signing.PrivateKey?

    /// Cached actor identity derived from the public key.
    private(set) public var actor: ActorIdentity?

    /// Whether a device key has been enrolled.
    public var isEnrolled: Bool { privateKey != nil }

    // MARK: - Init

    public init() {}

    // MARK: - Enrollment

    /// Creates (or retrieves) a Secure Enclave P-256 key for this device.
    ///
    /// The key is:
    /// - Non-exportable (hardware-bound)
    /// - Biometric-gated (Face ID / Touch ID required for every sign operation)
    /// - Persistent across app launches (stored in Keychain)
    ///
    /// Call this once during app setup. Subsequent calls return the existing key.
    @discardableResult
    public func enroll() throws -> ActorIdentity {
        // Try to load existing key from Keychain
        if let existing = try loadExistingKey() {
            self.privateKey = existing
            self.actor = try deriveActorIdentity(from: existing.publicKey)
            return self.actor!
        }

        // Create new Secure Enclave key with biometric protection
        let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            nil
        )!

        let privateKey = try SecureEnclave.P256.Signing.PrivateKey(
            compactRepresentable: false,
            accessControl: accessControl
        )

        // Save to Keychain for persistence
        try saveKeyToKeychain(privateKey)

        self.privateKey = privateKey
        self.actor = try deriveActorIdentity(from: privateKey.publicKey)
        return self.actor!
    }

    /// Removes the device key from Keychain and resets state.
    public func unenroll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Self.keychainTag.data(using: .utf8)!,
        ]
        SecItemDelete(query as CFDictionary)
        privateKey = nil
        actor = nil
    }

    // MARK: - Authorization

    /// Produces an agency envelope that binds this device's identity to a specific artifact.
    ///
    /// Flow:
    ///   1. Face ID / Touch ID authentication (biometric gate)
    ///   2. Build canonical payload: { actorKeyId, artifactHash, challenge, purpose, timestamp }
    ///   3. P-256 sign the canonical JSON bytes (DER format)
    ///   4. Return AgencyEnvelope with actor identity + signed authorization
    ///
    /// - Parameters:
    ///   - artifactHash: Base64 SHA-256 digest of the artifact being committed
    ///   - challenge: Enclave-issued nonce from POST /challenge
    ///   - reason: Face ID prompt reason (shown to user)
    ///
    /// - Returns: AgencyEnvelope ready to include in POST /commit
    public func authorize(
        artifactHash: String,
        challenge: String,
        reason: String = "Authorize OCC proof"
    ) async throws -> AgencyEnvelope {
        guard let privateKey = self.privateKey,
              let actor = self.actor
        else {
            throw AgencySignerError.notEnrolled
        }

        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)

        // Build canonical payload (alphabetically sorted keys)
        let payload = AuthorizationPayload(
            actorKeyId: actor.keyId,
            artifactHash: artifactHash,
            challenge: challenge,
            protocolVersion: "occ/1",
            purpose: Self.purpose,
            timestamp: timestamp
        )

        // Encode to canonical JSON (keys are already alphabetically ordered in the struct)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let payloadData = try encoder.encode(payload)

        // Sign with Face ID gate
        // The LAContext triggers biometric authentication automatically
        // because the key was created with .biometryCurrentSet access control
        let context = LAContext()
        context.localizedReason = reason

        let signature = try privateKey.signature(
            for: payloadData,
            authenticationContext: context
        )

        // Use DER representation — Node.js createVerify("SHA256") expects DER format
        let signatureB64 = signature.derRepresentation.base64EncodedString()

        return AgencyEnvelope(
            actor: actor,
            authorization: AgencyEnvelope.Authorization(
                purpose: Self.purpose,
                actorKeyId: actor.keyId,
                artifactHash: artifactHash,
                challenge: challenge,
                protocolVersion: "occ/1",
                timestamp: timestamp,
                signatureB64: signatureB64
            )
        )
    }

    // MARK: - Private Helpers

    /// Derives the actor identity from a P-256 public key.
    ///
    /// keyId = hex(SHA-256(SPKI DER public key bytes))
    private func deriveActorIdentity(from publicKey: P256.Signing.PublicKey) throws -> ActorIdentity {
        let spkiDer = publicKey.derRepresentation
        let publicKeyB64 = spkiDer.base64EncodedString()

        // keyId = hex(SHA-256(SPKI DER))
        let hash = SHA256.hash(data: spkiDer)
        let keyId = hash.map { String(format: "%02x", $0) }.joined()

        return ActorIdentity(
            keyId: keyId,
            publicKeyB64: publicKeyB64,
            algorithm: Self.algorithm,
            provider: Self.provider
        )
    }

    /// Loads an existing Secure Enclave key from Keychain.
    private func loadExistingKey() throws -> SecureEnclave.P256.Signing.PrivateKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Self.keychainTag.data(using: .utf8)!,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw AgencySignerError.keychainError(status)
        }

        // Reconstruct SecureEnclave key from the SecKey reference
        let secKey = item as! SecKey
        guard let keyData = SecKeyCopyExternalRepresentation(secKey, nil) as Data? else {
            throw AgencySignerError.keyExportFailed
        }

        return try SecureEnclave.P256.Signing.PrivateKey(
            dataRepresentation: keyData
        )
    }

    /// Saves a Secure Enclave key to Keychain for persistence.
    private func saveKeyToKeychain(_ key: SecureEnclave.P256.Signing.PrivateKey) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Self.keychainTag.data(using: .utf8)!,
            kSecValueRef as String: try key.representation(),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        // Delete any existing key first
        SecItemDelete(query as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw AgencySignerError.keychainError(status)
        }
    }
}

// MARK: - SecureEnclave key helper

private extension SecureEnclave.P256.Signing.PrivateKey {
    /// Returns a representation suitable for Keychain storage.
    func representation() throws -> Data {
        dataRepresentation
    }
}

// MARK: - Errors

public enum AgencySignerError: LocalizedError {
    case notEnrolled
    case keychainError(OSStatus)
    case keyExportFailed
    case signingFailed(String)

    public var errorDescription: String? {
        switch self {
        case .notEnrolled:
            return "Device key not enrolled. Call enroll() first."
        case .keychainError(let status):
            return "Keychain error: \(status)"
        case .keyExportFailed:
            return "Failed to export key from Secure Enclave"
        case .signingFailed(let reason):
            return "Signing failed: \(reason)"
        }
    }
}
