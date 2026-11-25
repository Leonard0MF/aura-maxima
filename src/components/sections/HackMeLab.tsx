"use client";

import { useId, useMemo, useState } from "react";

import { USERS, buildVulnerable, runSafe } from "@/lib/sqli";

const HINTS = [
  "O que acontece se você fechar a aspa?",
  "Tente fazer a condição ser sempre verdadeira.",
  "Payload no campo usuário: ' OR 1=1 --",
];

/*
 * Laboratório de SQL injection (educativo, só no navegador). Estado React por
 * tecla é ok aqui: é um formulário de verdade, não um efeito por frame.
 */
export function HackMeLab() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [safe, setSafe] = useState(false);
  const [hint, setHint] = useState(0);
  const [tried, setTried] = useState(false);
  const id = useId();

  const vuln = useMemo(() => buildVulnerable(user, pass), [user, pass]);
  const rows = safe ? runSafe(user, pass) : vuln.rows;
  const hit = new Set(rows.map((r) => r.id));
  const granted = tried && !safe && rows.length > 0;
  const blocked = tried && safe && vuln.injected;

  return (
    <div className="grid gap-px bg-ink/15 lg:grid-cols-3">
      {/* 1 · login falso */}
      <form
        className="flex flex-col gap-4 bg-paper p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
        }}
      >
        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">01 · Login</p>
        <h3 className="font-display text-2xl leading-none tracking-tight sm:text-3xl">Tente entrar sem a senha</h3>
        <label className="flex flex-col gap-1.5 font-mono text-xs tracking-wide uppercase">
          Usuário
          <input
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setTried(false);
            }}
            autoComplete="off"
            spellCheck={false}
            className="hack-input"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-mono text-xs tracking-wide uppercase">
          Senha
          <input
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setTried(false);
            }}
            autoComplete="off"
            spellCheck={false}
            className="hack-input"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="hack-btn hack-btn-solid">
            Entrar
          </button>
          <button type="button" className="hack-btn" onClick={() => setHint((h) => Math.min(HINTS.length, h + 1))} disabled={hint >= HINTS.length}>
            Preciso de uma dica
          </button>
        </div>
        {hint > 0 && (
          <ol className="space-y-1 border-t border-ink/15 pt-3 text-sm">
            {HINTS.slice(0, hint).map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-xs leading-6 text-ink-soft">{i + 1}.</span>
                {i === 2 ? (
                  <span>
                    Payload no campo usuário: <code className="font-mono text-[#b3261e]">&apos; OR 1=1 --</code>
                  </span>
                ) : (
                  h
                )}
              </li>
            ))}
          </ol>
        )}
        <div aria-live="polite" className="min-h-6">
          {granted && (
            <div className="hack-granted">
              <p className="font-display text-3xl tracking-tight text-[#b3261e]">ACCESS GRANTED</p>
              <p className="mt-1 text-sm">
                Logado como <b>{rows[0].user}</b>. Você acabou de explorar uma SQL injection. Agora veja como eu corrijo isso:{" "}
                <button type="button" className="ulink font-medium" onClick={() => setSafe(true)}>
                  ligue o modo seguro
                </button>
                .
              </p>
            </div>
          )}
          {tried && !granted && !safe && <p className="font-mono text-xs text-ink-soft uppercase">{vuln.error ? `ERROR: ${vuln.error}` : "Acesso negado"}</p>}
          {blocked && <p className="font-mono text-xs uppercase">Acesso negado · o payload foi tratado como texto</p>}
        </div>
      </form>

      {/* 2 · query */}
      <div className="flex flex-col gap-4 bg-paper p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">02 · Query montada no servidor</p>
          <button type="button" role="switch" aria-checked={safe} onClick={() => setSafe((s) => !s)} className="hack-switch">
            <span aria-hidden="true" />
            Modo seguro
          </button>
        </div>
        {safe ? (
          <>
            <pre className="hack-sql" aria-label="Query parametrizada">
              <b>SELECT</b> * <b>FROM</b> users <b>WHERE</b> user = <span className="text-accent-ink">$1</span> <b>AND</b> pass ={" "}
              <span className="text-accent-ink">$2</span>
            </pre>
            <dl className="space-y-2 font-mono text-xs">
              {[
                ["$1", user],
                ["$2", pass],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[2.5rem_1fr] items-baseline gap-2 border-t border-ink/15 pt-2">
                  <dt className="text-accent-ink">{k}</dt>
                  <dd className="break-all">
                    <span className="hack-param">{JSON.stringify(v)}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-ink-soft">
              Prepared statement: a query e os dados viajam separados. Aspas, <code className="font-mono">OR</code> e{" "}
              <code className="font-mono">--</code> chegam como texto literal, sem mudar a lógica da consulta.
            </p>
          </>
        ) : (
          <>
            <pre className="hack-sql" aria-label={`Query: ${vuln.sql}`}>
              {vuln.segs.map((s, i) => (
                <span key={i} className={`q-${s.kind}`}>
                  {s.text}
                </span>
              ))}
            </pre>
            <p className="text-sm text-ink-soft">
              Concatenação de strings: o que você digita vira parte do SQL.{" "}
              {vuln.injected ? <span className="text-[#b3261e]">Em vermelho: o que escapou da string e virou código.</span> : null}
            </p>
            {vuln.error && <p className="font-mono text-xs text-[#b3261e]">ERROR: {vuln.error}</p>}
          </>
        )}
      </div>

      {/* 3 · tabela */}
      <div className="flex flex-col gap-4 bg-paper p-4 sm:p-6">
        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">
          03 · Tabela users <span aria-live="polite">· {rows.length} linha(s) retornada(s)</span>
        </p>
        <table className="w-full font-mono text-xs" aria-describedby={id}>
          <thead>
            <tr className="text-left text-ink-soft uppercase">
              <th className="py-2 pl-2 font-normal">id</th>
              <th className="py-2 font-normal">user</th>
              <th className="py-2 font-normal">pass (hash)</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((r) => (
              <tr key={r.id} className={`border-t border-ink/15 ${hit.has(r.id) ? "hack-row-hit" : ""}`}>
                <td className="py-2 pl-2">{r.id}</td>
                <td className="py-2">{r.user}</td>
                <td className="py-2 text-ink-soft">{r.pass}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p id={id} className="text-sm text-ink-soft">
          Linhas acesas são as que a query devolveria. Usuários e hashes são fictícios.
        </p>
      </div>
    </div>
  );
}
