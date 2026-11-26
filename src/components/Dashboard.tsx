"use client";
import { Database, Download, LogOut, Plus, RefreshCcw, ShieldCheck, Sparkles, UserCog, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LABEL } from "@/lib/domain";
import { api, type Kpis, type Meta, type SessionInfo, type WorkOrder } from "./api";
import AuditView from "./AuditView";
import ChatWidget from "./ChatWidget";
import CreateWorkOrderDialog from "./CreateWorkOrderDialog";
import FilterBar, { EMPTY_FILTERS, toQuery, type UiFilters } from "./FilterBar";
import KpiTiles from "./KpiTiles";
import LoginPanel from "./LoginPanel";
import WorkOrderDrawer from "./WorkOrderDrawer";
import WorkOrderTable from "./WorkOrderTable";

const POLL_MS = 5000;

export default function Dashboard({ session, meta, reloadSession }: { session: SessionInfo; meta: Meta; reloadSession: () => void }) {
  const user = session.user!;
  const can = (p: string) => session.permissions.includes(p as never);
  const [tab, setTab] = useState<"ot" | "audit">("ot");
  const [filters, setFilters] = useState<UiFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Sincronización: sondeo periódico + refresco inmediato tras cada cambio
  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const query = useMemo(() => toQuery(filters), [filters]);
  useEffect(() => {
    let cancel = false;
    Promise.all([api.get<{ rows: WorkOrder[]; generatedAt: string }>(`/api/workorders?${query}`), api.get<Kpis>("/api/kpis")])
      .then(([r, k]) => {
        if (cancel) return;
        setRows(r.rows);
        setKpis(k);
        setUpdatedAt(r.generatedAt);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [query, tick]);

  const onMutated = useCallback(
    (wonum?: string, message?: string) => {
      refresh();
      if (wonum) {
        setFlash(wonum);
        setTimeout(() => setFlash(null), 2500);
      }
      if (message) {
        setToast(message);
        setTimeout(() => setToast(null), 4000);
      }
    },
    [refresh],
  );

  async function logout() {
    await api.send("/api/session", "DELETE");
    reloadSession();
  }
  async function reset() {
    if (!confirm("¿Restablecer todos los datos de demostración? Se perderán los cambios realizados por todos los usuarios.")) return;
    try {
      await api.send("/api/reset", "POST");
      setSelected(null);
      onMutated(undefined, "Datos restablecidos al estado inicial.");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const techs = meta.users.filter((u) => u.role === "CONTRATISTA");

  return (
    <div className="min-h-screen pb-24">
      {/* Barra superior estilo IBM Carbon UI Shell */}
      <header className="sticky top-0 z-30 flex h-12 items-center bg-c100 text-white">
        <div className="flex h-full items-center border-r border-c80 px-4 text-sm">
          <span className="font-semibold">EAM</span>
          <span className="ml-1 font-light">Sandbox</span>
        </div>
        <nav className="hidden h-full items-center text-sm md:flex">
          <span className="px-4 text-c30">Seguimiento de Órdenes de Trabajo</span>
        </nav>
        <div className="ml-auto flex h-full items-center">
          <span className="hidden items-center gap-1 px-3 text-xs text-c30 lg:flex" title="Persistencia">
            <Database size={14} /> {session.storage === "supabase" ? "Supabase" : "Memoria"}
          </span>
          <span className="hidden items-center gap-1 px-3 text-xs text-c30 lg:flex" title="Motor del chatbot">
            <Sparkles size={14} /> {session.engine.label}
          </span>
          {session.readOnly && (
            <span className="mx-2 flex items-center gap-1 bg-yellow30 px-2 py-0.5 text-xs font-medium text-c100">
              <ShieldCheck size={14} /> Solo lectura
            </span>
          )}
          {can("data.reset") && (
            <button onClick={reset} className="flex h-full items-center gap-1 px-3 text-xs text-c30 hover:bg-c80" title="Restablecer datos de demostración">
              <RefreshCcw size={14} /> <span className="hidden xl:inline">Restablecer datos</span>
            </button>
          )}
          <button onClick={() => setShowSwitch(true)} className="flex h-full items-center gap-2 border-l border-c80 px-4 text-left hover:bg-c80">
            <UserCog size={18} />
            <span className="leading-tight">
              <span className="block text-sm">{user.name}</span>
              <span className="block text-[11px] text-c40">{ROLE_LABEL[user.role]}</span>
            </span>
          </button>
          <button onClick={logout} className="flex h-full w-12 items-center justify-center hover:bg-c80" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Encabezado de la aplicación */}
      <div className="border-b border-c20 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 pt-4 lg:px-6">
          <p className="text-xs text-c60">Gestión de trabajo / Órdenes de trabajo</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-light">Seguimiento de Órdenes de Trabajo</h1>
            <div className="flex gap-2 pb-2">
              {can("export") && (
                <a href={`/api/export?${query}`} className="inline-flex h-10 items-center gap-2 bg-c80 px-4 text-sm text-white hover:bg-c70">
                  <Download size={16} /> Exportar CSV
                </a>
              )}
              {can("wo.create") && !session.readOnly && (
                <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 bg-blue60 px-4 text-sm text-white hover:bg-[#0353e9]">
                  <Plus size={16} /> Nueva OT
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex gap-6 text-sm">
            {(
              [
                ["ot", "Órdenes de trabajo"],
                ["audit", "Historial de auditoría"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`border-b-2 pb-2 ${tab === k ? "border-blue60 font-medium text-c100" : "border-transparent text-c60 hover:text-c100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1440px] px-4 py-4 lg:px-6">
        {user.role === "CONTRATISTA" && (
          <p className="mb-3 border-l-4 border-blue60 bg-blue10 px-3 py-2 text-xs text-c80">
            Alcance de su perfil: solo ve las órdenes asignadas a <strong>{user.company}</strong>.
          </p>
        )}
        {tab === "ot" ? (
          <>
            <KpiTiles kpis={kpis} onPick={(f) => setFilters({ ...EMPTY_FILTERS, ...f })} />
            <FilterBar filters={filters} onChange={setFilters} meta={meta} techs={techs} />
            <WorkOrderTable rows={rows} users={meta.users} onOpen={setSelected} flash={flash} updatedAt={updatedAt} />
          </>
        ) : (
          <AuditView tick={tick} onOpen={(w) => setSelected(w)} />
        )}
      </main>

      {selected && (
        <WorkOrderDrawer
          wonum={selected}
          tick={tick}
          meta={meta}
          onClose={() => setSelected(null)}
          onMutated={(w, m) => onMutated(w, m)}
        />
      )}

      {showCreate && (
        <CreateWorkOrderDialog
          meta={meta}
          onClose={() => setShowCreate(false)}
          onCreated={(w) => {
            setShowCreate(false);
            onMutated(w, `Orden ${w} creada.`);
            setSelected(w);
          }}
        />
      )}

      {showSwitch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-c100/60 p-4 pt-16" onClick={() => setShowSwitch(false)}>
          <div className="w-full max-w-3xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-c20 px-4 py-3">
              <h2 className="text-lg">Cambiar perfil de prueba</h2>
              <button onClick={() => setShowSwitch(false)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <LoginPanel
              meta={meta}
              currentUserId={user.id}
              onLogin={() => {
                setShowSwitch(false);
                reloadSession();
              }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 border-l-4 border-green50 bg-c90 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <ChatWidget session={session} onMutated={onMutated} onOpenWo={setSelected} />
    </div>
  );
}
