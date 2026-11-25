import type { SlotSummary } from '../core/save';
import { L } from '../core/lang';

/** "11/25 09:40" in the player's own time. */
function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Two lines for a save slot button. */
export function slotLabel(slot: number, s: SlotSummary | undefined): string {
  if (!s) return L(`${slot + 1}번 슬롯 · 비어 있음`, `Slot ${slot + 1} · Empty`);
  const who = s.hunter ? `${s.hunter.name} Lv.${s.hunter.level}` : L('헌터 없음', 'No hunter');
  return L(`${slot + 1}번 · ${s.agency} · ${s.day + 1}일차\n${who} · ${s.gold}G · ${when(s.savedAt)}`, `Slot ${slot + 1} · ${s.agency} · Day ${s.day + 1}\n${who} · ${s.gold}G · ${when(s.savedAt)}`);
}
