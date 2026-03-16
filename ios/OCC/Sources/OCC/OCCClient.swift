// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import CryptoKit
import Foundation

// MARK: - OCC API Client

/// HTTP client for the OCC commit service.
///
/// Endpoints used:
///   - POST /challenge → { challenge: string }
///   - POST /commit    → OCCProof[]
///   - GET  /key       → { publicKeyB64, measurement, enforcement }
///   - GET  /health    → { ok: true }
public final class OCCClient: Sendable {
    public let baseURL: URL
    private let apiKey: String?
    private let session: URLSession

    /// Creates an OCC API client.
    ///
    /// - Parameters:
    ///   - baseURL: Server URL (e.g. "https://commit.occ.wtf" or "http://localhost:8787")
    ///   - apiKey: Optional API key for authenticated endpoints (POST /commit)
    public init(baseURL: URL, apiKey: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.session = session
    }

    // MARK: - Challenge

    /// Requests a fresh challenge nonce from the enclave.
    ///
    /// The challenge is used as an anti-replay nonce: the device signs it
    /// as part of the authorization payload, and the enclave verifies it
    /// was recently issued and hasn't been used before.
    ///
    /// - Returns: Base64-encoded challenge string
    public func requestChallenge() async throws -> String {
        let url = baseURL.appendingPathComponent("challenge")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)

        let result = try JSONDecoder().decode(ChallengeResponse.self, from: data)
        return result.challenge
    }

    // MARK: - Commit

    /// Commits one or more artifact digests, optionally with an agency envelope.
    ///
    /// - Parameters:
    ///   - digests: Array of SHA-256 digest strings (Base64)
    ///   - metadata: Optional advisory metadata (not signed)
    ///   - agency: Optional agency envelope (actor identity + P-256 authorization)
    ///
    /// - Returns: Array of OCC proofs (one per digest)
    public func commit(
        digests: [String],
        metadata: [String: String]? = nil,
        agency: AgencyEnvelope? = nil
    ) async throws -> [OCCProof] {
        let url = baseURL.appendingPathComponent("commit")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let apiKey = apiKey {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let body = CommitRequest(
            digests: digests.map { CommitRequest.DigestEntry(digestB64: $0, hashAlg: "sha256") },
            metadata: metadata,
            agency: agency
        )

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)

        return try JSONDecoder().decode([OCCProof].self, from: data)
    }

    /// Convenience: commit a single artifact with agency signing.
    ///
    /// Full flow:
    ///   1. SHA-256 the artifact bytes
    ///   2. Request a challenge from the enclave
    ///   3. Sign the authorization with the device key (Face ID)
    ///   4. POST /commit with the agency envelope
    ///
    /// - Parameters:
    ///   - data: Raw artifact bytes
    ///   - signer: AgencySigner with an enrolled device key
    ///   - metadata: Optional advisory metadata
    ///
    /// - Returns: The OCC proof (single)
    public func commitWithAgency(
        data artifactData: Data,
        signer: AgencySigner,
        metadata: [String: String]? = nil
    ) async throws -> OCCProof {
        // Step 1: SHA-256 the artifact
        let digest = SHA256.hash(data: artifactData)
        let digestB64 = Data(digest).base64EncodedString()

        // Step 2: Request challenge from enclave
        let challenge = try await requestChallenge()

        // Step 3: Sign authorization (triggers Face ID)
        let agency = try await signer.authorize(
            artifactHash: digestB64,
            challenge: challenge
        )

        // Step 4: Commit with agency
        let proofs = try await commit(
            digests: [digestB64],
            metadata: metadata,
            agency: agency
        )

        guard let proof = proofs.first else {
            throw OCCClientError.emptyResponse
        }

        return proof
    }

    // MARK: - Key Info

    /// Gets the enclave's public key, measurement, and enforcement tier.
    public func getKeyInfo() async throws -> KeyInfo {
        let url = baseURL.appendingPathComponent("key")
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(KeyInfo.self, from: data)
    }

    // MARK: - Health

    /// Checks if the server is healthy.
    public func healthCheck() async throws -> Bool {
        let url = baseURL.appendingPathComponent("health")
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        let result = try JSONDecoder().decode(HealthResponse.self, from: data)
        return result.ok
    }

    // MARK: - Private

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OCCClientError.invalidResponse
        }
        guard (200 ... 299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "unknown"
            throw OCCClientError.serverError(
                statusCode: httpResponse.statusCode,
                body: errorBody
            )
        }
    }
}

// MARK: - Response Types

private struct ChallengeResponse: Codable {
    let challenge: String
}

private struct HealthResponse: Codable {
    let ok: Bool
}

public struct KeyInfo: Codable, Sendable {
    public let publicKeyB64: String
    public let measurement: String
    public let enforcement: String
}

/// Minimal OCC proof structure for the iOS client.
/// Full verification should be done server-side or with the occproof SDK.
public struct OCCProof: Codable, Sendable {
    public let version: String
    public let artifact: Artifact
    public let commit: Commit
    public let signer: Signer
    public let environment: Environment
    public let agency: AgencyBlock?
    public let metadata: [String: AnyCodable]?
    public let timestamps: Timestamps?

    public struct Artifact: Codable, Sendable {
        public let hashAlg: String
        public let digestB64: String
    }

    public struct Commit: Codable, Sendable {
        public let nonceB64: String
        public let counter: String?
        public let time: Int64?
        public let epochId: String?
    }

    public struct Signer: Codable, Sendable {
        public let publicKeyB64: String
        public let signatureB64: String
    }

    public struct Environment: Codable, Sendable {
        public let enforcement: String
        public let measurement: String
    }

    public struct AgencyBlock: Codable, Sendable {
        public let actor: ActorIdentity
        public let authorization: AuthorizationBlock

        public struct AuthorizationBlock: Codable, Sendable {
            public let purpose: String
            public let actorKeyId: String
            public let artifactHash: String
            public let challenge: String
            public let timestamp: Int64
            public let signatureB64: String
        }
    }

    public struct Timestamps: Codable, Sendable {
        public let artifact: TSAEntry?
        public let proof: TSAEntry?

        public struct TSAEntry: Codable, Sendable {
            public let authority: String
            public let time: String
        }
    }
}

// MARK: - AnyCodable (minimal)

/// Minimal type-erased Codable for metadata values.
public struct AnyCodable: Codable, Sendable {
    public let value: Any

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else {
            value = try container.decode(String.self)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else {
            try container.encode(String(describing: value))
        }
    }
}

// MARK: - Errors

public enum OCCClientError: LocalizedError {
    case invalidResponse
    case serverError(statusCode: Int, body: String)
    case emptyResponse

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let code, let body):
            return "Server error \(code): \(body)"
        case .emptyResponse:
            return "Server returned empty proof array"
        }
    }
}
