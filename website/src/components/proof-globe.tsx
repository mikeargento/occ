/* ── Syntax-highlighted JSON helpers ── */
const K = ({ children }: { children: string }) => (
  <span className="text-syntax-key">{`"${children}"`}</span>
);
const S = ({ children }: { children: string }) => (
  <span className="text-syntax-string">{`"${children}"`}</span>
);
const N = ({ children }: { children: string | number }) => (
  <span className="text-syntax-number">{children}</span>
);

function ProofLine() {
  return (
    <>
      {`{ `}<K>version</K>{`: `}<S>occ/1</S>{`, `}
      <K>artifact</K>{`: { `}<K>hashAlg</K>{`: `}<S>sha256</S>{`, `}
      <K>digestB64</K>{`: `}<S>VmSUR4azmbQ9WmWeajc10XLvcGMfHutn5Ikkx9fewHI=</S>{` }, `}
      <K>commit</K>{`: { `}<K>nonceB64</K>{`: `}<S>MFsVZDsJxC9LS0yTqiaU8QflQ97d9DcKuF8UVfD46S0=</S>{`, `}
      <K>counter</K>{`: `}<N>98</N>{`, `}<K>slotCounter</K>{`: `}<N>97</N>{`, `}
      <K>time</K>{`: `}<N>1773368713218</N>{`, `}
      <K>epochId</K>{`: `}<S>/qXZiO+PUKMAvVcoth+czcaid7wyoyU+AWjGWRHD4yo=</S>{`, `}
      <K>prevB64</K>{`: `}<S>73KJVymGT7I/EJWf5giBblJpdPGwVtXMW1jamUKWMWM=</S>{` }, `}
      <K>signer</K>{`: { `}<K>publicKeyB64</K>{`: `}<S>QQeecy4yv6dhExeBMVyevBpG2LOUpD6DS0wiEMa9EWE=</S>{`, `}
      <K>signatureB64</K>{`: `}<S>p74Jjzk9B5ieSTqlf1DcCLKnBt/6jBkwVGTJCJ3Z4+PFusMmeu9uqiUCTgHqKwFRidd4A/cHlS5dZpx2camyBw==</S>{` }, `}
      <K>environment</K>{`: { `}<K>enforcement</K>{`: `}<S>measured-tee</S>{`, `}
      <K>measurement</K>{`: `}<S>1acdac0aa2d72178cc8ed9d77a7e07c63fa47c2db9db186eed48ca5ea126f45da98acbc22531aac2c837bee4cc542dee</S>{`, `}
      <K>attestation</K>{`: { `}<K>format</K>{`: `}<S>aws-nitro</S>{` } }, `}
      <K>timestamps</K>{`: { `}<K>authority</K>{`: `}<S>freetsa.org</S>{`, `}<K>time</K>{`: `}<S>2026-03-13T02:25:13Z</S>{` }, `}
      <K>agency</K>{`: { `}<K>algorithm</K>{`: `}<S>ES256</S>{`, `}<K>provider</K>{`: `}<S>passkey</S>{` }, `}
      <K>attribution</K>{`: { `}<K>name</K>{`: `}<S>Mike Argento</S>{`, `}<K>title</K>{`: `}<S>Photo taken with the Ricoh GR IIIx</S>{` }, `}
      <K>slotAllocation</K>{`: { `}<K>version</K>{`: `}<S>occ/slot/1</S>{`, `}<K>counter</K>{`: `}<N>97</N>{` } }`}
    </>
  );
}

export function ProofGlobe() {
  return (
    <div className="aspect-square max-w-[480px] w-full rounded-full overflow-hidden">
      <div
        className="w-full h-full select-none overflow-hidden p-2"
        aria-hidden="true"
      >
        <div className="text-[5px] sm:text-[6px] leading-[1.4] font-mono break-all pointer-events-none">
          {Array.from({ length: 30 }, (_, i) => (
            <ProofLine key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
