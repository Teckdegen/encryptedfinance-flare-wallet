"use client";
import { Shield, Loader2, Check, AlertTriangle } from "lucide-react";
import { EfiState } from "../lib/efi/useEfi";

/**
 * Gates private actions behind one-time spending-key registration. First-time
 * users click "Enable Private Transfers" → one wallet signature → the key is
 * derived locally and registered with the TEE. Until that resolves, private
 * actions are blocked.
 */
export function PrivacyGate({ efi, children }: { efi: EfiState; children: React.ReactNode }) {
  if (efi.regState === "registered") return <>{children}</>;

  if (efi.regState === "error") {
    return (
      <div className="glass rounded-3xl p-6 text-center space-y-3">
        <AlertTriangle size={28} className="mx-auto text-amber-600" />
        <div className="text-sm font-bold">Can't reach the private layer</div>
        <div className="text-xs text-muted">{efi.regError ?? "TEE unavailable"}</div>
        <button onClick={efi.refresh} className="glass-btn px-6 py-2 rounded-full text-sm font-bold">
          Retry
        </button>
      </div>
    );
  }

  const busy = efi.regState === "registering";
  // A cached key already on this device means the enclave was wiped/redeployed
  // and just needs it re-registered — no new signature, gasless, one tap.
  const reRegister = !!efi.spendingKeyHex;
  return (
    <div className="glass rounded-3xl p-6 text-center space-y-4">
      <div className="w-14 h-14 rounded-full glass-strong flex items-center justify-center mx-auto">
        <Shield size={26} className="text-ink" />
      </div>
      <div>
        <div className="text-base font-bold mb-1">
          {reRegister ? "Re-register your spending key" : "Enable Private Transfers"}
        </div>
        <div className="text-xs text-muted leading-relaxed">
          {reRegister
            ? "No spending key found on the TEE for this wallet. Your key is still on this device — one tap re-registers it with the enclave. No signature, gasless."
            : "One signature derives your spending key in this browser and registers it with the TEE. It never leaves your device. You only do this once."}
        </div>
      </div>
      <button
        onClick={() => efi.enablePrivacy().catch(() => {})}
        disabled={busy || !efi.ready}
        className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2"
      >
        {busy ? (
          <><Loader2 size={16} className="animate-spin" /> Registering with TEE…</>
        ) : (
          <><Check size={16} /> {reRegister ? "Register with TEE" : "Enable Private Transfers"}</>
        )}
      </button>
      {busy && (
        <div className="text-[11px] text-muted">
          Waiting for the enclave to confirm — this can take a few seconds.
        </div>
      )}
    </div>
  );
}
