BitGraph proof package
======================

Contents:
  <the original file>     the artifact this proof is about
  proof.json              cryptographic proof, signed inside an AWS Nitro
                          hardware enclave. The full attestation (AWS
                          Nitro COSE document, certificate chain, PCR0
                          measurement) is embedded at
                          environment.attestation.reportB64, so any
                          verifier can independently check the hardware
                          claim.
  ethereum-anchor.json    the Ethereum block this proof is anchored to.

To verify
---------
Drop this package on https://bitgraph.ing

The site checks the signature, slot binding, and Ethereum anchor, and
lets you run the full AWS Nitro attestation verification in your browser.
No installs, no servers.

For developers
--------------
Verifier source code:  https://github.com/mikeargento/bitgraph
npm package:           @mikeargento/bitgraph
