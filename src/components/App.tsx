"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Meta, type SessionInfo } from "./api";
import Dashboard from "./Dashboard";
import LoginPanel from "./LoginPanel";

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([api.get<SessionInfo>("/api/session"), api.get<Meta>("/api/meta")]);
    setSession(s);
    setMeta(m);
  }, []);

  useEffect(() => {
    load();
    const onUnauth = () => load();
    window.addEventListener("ot:unauthorized", onUnauth);
    return () => window.removeEventListener("ot:unauthorized", onUnauth);
  }, [load]);

  if (!session || !meta)
    return <div className="flex h-screen items-center justify-center text-sm text-c60">Cargando simulador…</div>;

  if (!session.user)
    return (
      <div className="min-h-screen bg-c100">
        <header className="flex h-12 items-center border-b border-c80 px-4 text-sm text-white">
          <span className="font-semibold">EAM</span>
          <span className="ml-1 font-light">Sandbox · Seguimiento de Órdenes de Trabajo</span>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-light text-white">Seleccione un perfil de prueba</h1>
          <p className="mt-2 max-w-2xl text-sm text-c30">
            Simulador inspirado en IBM Maximo. Cada perfil tiene permisos distintos (RBAC): cambie de perfil desde la barra
            superior para comprobar cómo el sistema y el chatbot protegen la integridad de los datos.
          </p>
          <div className="mt-8 bg-white">
            <LoginPanel meta={meta} onLogin={load} />
          </div>
        </main>
      </div>
    );

  return <Dashboard key={session.user.id} session={session} meta={meta} reloadSession={load} />;
}
