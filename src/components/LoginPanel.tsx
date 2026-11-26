"use client";
import { KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { ROLE_LABEL } from "@/lib/domain";
import { ROLE_DESCRIPTION } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { api, type Meta } from "./api";
import { Button, inputCls, labelCls } from "./ui";

const ROLE_ORDER: Role[] = ["CONTRATISTA", "PLANEACION", "ANALISTA"];

export default function LoginPanel({ meta, onLogin, currentUserId }: { meta: Meta; onLogin: () => void; currentUserId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPins = Object.keys(meta.demoPins).length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.send("/api/session", "POST", { userId: selected, pin });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_280px]">
      <div className="divide-y divide-c20">
        {ROLE_ORDER.map((role) => (
          <section key={role} className="p-4">
            <h3 className="text-sm font-semibold">{ROLE_LABEL[role]}</h3>
            <p className="mb-2 text-xs text-c60">{ROLE_DESCRIPTION[role]}</p>
            <div className="flex flex-wrap gap-2">
              {meta.users
                .filter((u) => u.role === role)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelected(u.id);
                      setPin("");
                      setError(null);
                    }}
                    className={`flex items-center gap-2 border px-3 py-2 text-left text-sm ${
                      selected === u.id ? "border-blue60 bg-blue10" : "border-c20 hover:bg-c10"
                    }`}
                  >
                    <UserRound size={16} className="text-c60" />
                    <span>
                      <span className="block font-medium">
                        {u.name}
                        {u.id === currentUserId && <span className="ml-1 text-xs text-blue60">(activo)</span>}
                      </span>
                      <span className="block text-xs text-c60">{u.company}</span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-c20 bg-c10 p-4 md:border-l md:border-t-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} /> Acceso con PIN
        </div>
        {selected ? (
          <>
            <p className="text-xs text-c70">
              Perfil: <strong>{meta.users.find((u) => u.id === selected)?.name}</strong>
            </p>
            <div>
              <label className={labelCls} htmlFor="pin">
                PIN de 4 dígitos
              </label>
              <input
                id="pin"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={inputCls}
                placeholder="••••"
              />
            </div>
            {error && <p className="text-xs text-red60">{error}</p>}
            <Button type="submit" disabled={busy || pin.length < 4}>
              {busy ? "Validando…" : "Ingresar"}
            </Button>
          </>
        ) : (
          <p className="text-xs text-c60">Elija un perfil de la lista.</p>
        )}
        {hasPins && (
          <details className="mt-auto text-xs text-c70">
            <summary className="cursor-pointer">PINs de demostración</summary>
            <ul className="mt-2 space-y-0.5 font-mono">
              {meta.users.map((u) => (
                <li key={u.id}>
                  {u.id}: {meta.demoPins[u.id]}
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </div>
  );
}
