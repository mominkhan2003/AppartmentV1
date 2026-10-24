import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FinancialReport, FinancialReportEntry } from "@/lib/types";

const SLATE: [number, number, number] = [30, 41, 59]; // #1e293b
const BLUE: [number, number, number] = [37, 99, 235]; // #2563eb
const BLUE_SOFT: [number, number, number] = [239, 246, 255];
const AMBER_BG: [number, number, number] = [255, 251, 235]; // #fffbeb
const AMBER_BORDER: [number, number, number] = [245, 158, 11];
const AMBER_TEXT: [number, number, number] = [146, 64, 14];
const RED_BG: [number, number, number] = [254, 226, 226]; // #fee2e2
const RED_TEXT: [number, number, number] = [185, 28, 28];
const GREEN_TEXT: [number, number, number] = [21, 128, 61];
const GREEN_BG: [number, number, number] = [220, 252, 231];
const GRAY_TEXT: [number, number, number] = [100, 116, 139];
const LIGHT_BORDER: [number, number, number] = [203, 213, 225];
const ROW_ALT: [number, number, number] = [248, 250, 252];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;

const money = (cents: number | null | undefined) => {
  const value = (cents ?? 0) / 100;
  const sign = value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
};

const signedMoney = (cents: number) => {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
};

const longDate = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const shortDate = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const typeLabel = (entry: FinancialReportEntry) => {
  if (entry.type === "contribution") return "Contribution";
  if (entry.type === "expense") return "Expense";
  if (entry.type === "direct_payment") return "Direct store";
  return "Adjustment";
};

function sectionFor(entry: FinancialReportEntry): string {
  const date = entry.date;
  if (date <= "2026-10-05") return "Initial pool setup & expenses";
  if (date <= "2026-10-07") return "Round 2 budget expansion & daily expenses";
  if (date <= "2026-10-13") return "Mid-October expenses";
  if (date <= "2026-10-16") return "Round 3 & 4 budgets and settlement";
  return "High-expense phase, Round 5 & final position";
}

const sectionRanges: Record<string, string> = {
  "Initial pool setup & expenses": "Oct 2 – Oct 5, 2026",
  "Round 2 budget expansion & daily expenses": "Oct 5 – Oct 7, 2026",
  "Mid-October expenses": "Oct 8 – Oct 13, 2026",
  "Round 3 & 4 budgets and settlement": "Oct 13 – Oct 16, 2026",
  "High-expense phase, Round 5 & final position": "Oct 17 – Oct 24, 2026",
};

function drawCover(doc: jsPDF, report: FinancialReport) {
  const pending = report.member_status.filter((m) => m.status === "pending");
  const settled = report.member_status.filter((m) => m.status === "settled");

  doc.setFillColor(...SLATE);
  doc.rect(0, 0, PAGE_W, 54, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text(report.title, MARGIN, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(191, 219, 254);
  doc.text(report.subtitle, MARGIN, 30);
  doc.setFontSize(8.5);
  doc.text(`Reporting period: ${longDate(report.period_start)} – ${longDate(report.period_end)}`, MARGIN, 38);
  doc.text("Prepared for the five flatmates · FlatMate Hub", MARGIN, 44);

  doc.setFillColor(...BLUE);
  doc.roundedRect(151, 14, 45, 9, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("AUDIT READY", 173.5, 19.8, { align: "center" });

  // Metric cards
  const cardY = 64;
  const cardW = 87;
  const cardH = 25;
  const gap = 8;
  const cards: Array<{ label: string; value: string; note: string; fill: [number, number, number]; text: [number, number, number] }> = [
    {
      label: "Live pool balance",
      value: money(report.pool.pool_balance_cents),
      note: "Total contributions - total purchases",
      fill: report.pool.pool_balance_cents < 0 ? RED_BG : GREEN_BG,
      text: report.pool.pool_balance_cents < 0 ? RED_TEXT : GREEN_TEXT,
    },
    {
      label: "Active members",
      value: String(report.active_members),
      note: "Momin · Abu Bakr · Raja Iqbal · Umar Zeb · Asif",
      fill: BLUE_SOFT,
      text: BLUE,
    },
    {
      label: "Total group contributions",
      value: money(report.pool.contributions_cents),
      note: `Cash ${money(report.pool.cash_contributions_cents)} + direct ${money(report.pool.direct_contributions_cents)}`,
      fill: [255, 255, 255],
      text: SLATE,
    },
    {
      label: "Total group purchases",
      value: money(report.pool.purchases_cents),
      note: `Pool ${money(report.pool.pool_purchases_cents)} + direct ${money(report.pool.direct_purchases_cents)}`,
      fill: [255, 255, 255],
      text: SLATE,
    },
  ];

  cards.forEach((card, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (cardW + gap);
    const y = cardY + row * (cardH + 6);
    doc.setFillColor(...card.fill);
    doc.setDrawColor(...LIGHT_BORDER);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, "FD");
    doc.setTextColor(...GRAY_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(card.label.toUpperCase(), x + 4, y + 6);
    doc.setTextColor(...card.text);
    doc.setFontSize(15);
    doc.text(card.value, x + 4, y + 14);
    doc.setTextColor(...GRAY_TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(card.note, x + 4, y + 20);
  });

  // Formula callout
  const formulaY = cardY + 2 * (cardH + 6) + 2;
  doc.setFillColor(...SLATE);
  doc.roundedRect(MARGIN, formulaY, PAGE_W - MARGIN * 2, 17, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("OVERALL GROUP BALANCE =", MARGIN + 4, formulaY + 5.2);
  doc.text("TOTAL GROUP CONTRIBUTIONS - TOTAL GROUP PURCHASES", MARGIN + 4, formulaY + 9.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(191, 219, 254);
  doc.text(
    `${money(report.pool.contributions_cents)} - ${money(report.pool.purchases_cents)} = ${money(report.pool.pool_balance_cents)}`,
    MARGIN + 4,
    formulaY + 13.6,
  );

  // Member status table
  autoTable(doc, {
    startY: formulaY + 24,
    head: [["Member", "Role", "Round 5 status", "Detail"]],
    body: report.member_status.map((member) => [
      member.display_name,
      member.is_admin ? "Admin / Member" : "Member",
      member.status === "pending" ? "ACTION REQUIRED" : "SETTLED",
      member.status === "pending"
        ? member.status_note ??
          `Pending ${money(member.outstanding_cents)} contribution for Round 5.`
        : "Contribution settled.",
    ]),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 2.4, textColor: SLATE, lineColor: LIGHT_BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.4 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: "bold" },
      1: { cellWidth: 28 },
      2: { cellWidth: 34, fontStyle: "bold" },
      3: { cellWidth: 82 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const member = report.member_status[data.row.index];
      if (!member) return;
      if (member.status === "pending") {
        data.cell.styles.fillColor = AMBER_BG;
        data.cell.styles.textColor = data.column.index === 2 ? AMBER_TEXT : SLATE;
      } else if (data.column.index === 2) {
        data.cell.styles.textColor = GREEN_TEXT;
      }
    },
  });

  const afterTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;

  // Action required callout
  const pendingMember = pending[0];
  if (pendingMember) {
    const y = Math.min(afterTable + 7, 238);
    doc.setFillColor(...AMBER_BG);
    doc.setDrawColor(...AMBER_BORDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 22, 2.5, 2.5, "FD");
    doc.setTextColor(...AMBER_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("ACTION REQUIRED", MARGIN + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    const note =
      pendingMember.status_note ?? `Pending ${money(pendingMember.outstanding_cents)} contribution for Round 5.`;
    doc.text(`${pendingMember.display_name}: ${note}`, MARGIN + 4, y + 12, { maxWidth: PAGE_W - MARGIN * 2 - 8 });
    doc.text("The amount can be offset directly against upcoming grocery purchases.", MARGIN + 4, y + 18);
  }

  // Summary footer box
  const summaryY = 266;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LIGHT_BORDER);
  doc.roundedRect(MARGIN, summaryY, PAGE_W - MARGIN * 2, 16, 2.5, 2.5, "FD");
  doc.setTextColor(...SLATE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("FINAL POSITION (OCT 24, 2026)", MARGIN + 4, summaryY + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Current deficit ${money(report.pool.pool_balance_cents)} · ${settled.length} members settled · ${pending.length} member action required · Next budget call ${money(report.next_budget_cents)} / member`,
    MARGIN + 4,
    summaryY + 11,
    { maxWidth: PAGE_W - MARGIN * 2 - 8 },
  );
}

function addContentHeader(doc: jsPDF, section: string, range: string) {
  doc.setFillColor(...SLATE);
  doc.rect(0, 0, PAGE_W, 13, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Flatmate Financial Audit Ledger", MARGIN, 8.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(191, 219, 254);
  doc.text(range, PAGE_W - MARGIN, 8.4, { align: "right" });

  doc.setTextColor(...BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(section.toUpperCase(), MARGIN, 22);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 24.5, MARGIN + 42, 24.5);
}

function drawEntriesTable(doc: jsPDF, entries: FinancialReportEntry[], startY: number) {
  autoTable(doc, {
    startY,
    head: [["Date", "Item / Description", "Paid by", "Type", "Amount", "Pool balance"]],
    body: entries.map((entry) => {
      const signedAmount = entry.type === "expense" ? -entry.amount_cents : entry.amount_cents;
      return [
        shortDate(entry.date),
        entry.description,
        entry.paid_by,
        typeLabel(entry),
        entry.type === "direct_payment" ? `${money(entry.amount_cents)}` : signedMoney(signedAmount),
        entry.type === "direct_payment" ? "—" : money(entry.running_balance_cents),
      ];
    }),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2,
      textColor: SLATE,
      lineColor: LIGHT_BORDER,
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 65 },
      2: { cellWidth: 33 },
      3: { cellWidth: 21 },
      4: { cellWidth: 22, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 23, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const entry = entries[data.row.index];
      if (!entry) return;
      if (entry.type === "direct_payment") {
        data.cell.styles.fillColor = AMBER_BG;
        data.cell.styles.textColor = AMBER_TEXT;
      } else if (data.column.index === 4) {
        data.cell.styles.textColor = entry.type === "expense" ? RED_TEXT : GREEN_TEXT;
      } else if (data.column.index === 5 && entry.running_balance_cents < 0) {
        data.cell.styles.textColor = RED_TEXT;
      }
    },
  });
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
}

function drawSectionSummary(
  doc: jsPDF,
  y: number,
  entries: FinancialReportEntry[],
  closing: number,
) {
  const contributions = entries
    .filter((entry) => entry.type === "contribution")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const expenses = entries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const direct = entries
    .filter((entry) => entry.type === "direct_payment")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);

  const boxY = y + 5;
  if (boxY > PAGE_H - 38) {
    doc.addPage();
    doc.setFillColor(...SLATE);
    doc.rect(0, 0, PAGE_W, 13, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Flatmate Financial Audit Ledger", MARGIN, 8.4);
    return;
  }
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LIGHT_BORDER);
  doc.roundedRect(MARGIN, boxY, PAGE_W - MARGIN * 2, 15, 2.5, 2.5, "FD");
  doc.setTextColor(...GRAY_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("SECTION SUMMARY", MARGIN + 4, boxY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Contributions ${money(contributions)} · Expenses ${money(expenses)} · Direct store payments ${money(direct)} · Closing pool balance ${money(closing)}`,
    MARGIN + 4,
    boxY + 10.5,
    { maxWidth: PAGE_W - MARGIN * 2 - 8 },
  );
}

function drawFinalSummary(doc: jsPDF, report: FinancialReport) {
  doc.addPage();
  addContentHeader(doc, "Final audit summary", `${longDate(report.period_start)} – ${longDate(report.period_end)}`);

  let y = 32;
  const positive = report.pool.pool_balance_cents >= 0;
  doc.setFillColor(...(positive ? GREEN_BG : RED_BG));
  doc.setDrawColor(...(positive ? GREEN_TEXT : RED_TEXT));
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 30, 3, 3, "FD");
  doc.setTextColor(...(positive ? GREEN_TEXT : RED_TEXT));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(positive ? "CURRENT ACCOUNT BALANCE" : "CURRENT ACCOUNT DEFICIT", MARGIN + 5, y + 7);
  doc.setFontSize(25);
  doc.text(money(report.pool.pool_balance_cents), MARGIN + 5, y + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(
    `After accounting for all cash contributions and grocery runs through ${longDate(report.period_end)}.`,
    MARGIN + 5,
    y + 26,
  );

  y += 38;
  autoTable(doc, {
    startY: y,
    head: [["Ledger component", "Amount"]],
    body: [
      ["Cash contributions", money(report.pool.cash_contributions_cents)],
      ["Direct store payments (member credit)", money(report.pool.direct_contributions_cents)],
      ["Total group contributions", money(report.pool.contributions_cents)],
      ["Pool-funded purchases", money(report.pool.pool_purchases_cents)],
      ["Direct purchases (offset by member credit)", money(report.pool.direct_purchases_cents)],
      ["Total group purchases", money(report.pool.purchases_cents)],
      ["Overall group balance", money(report.pool.pool_balance_cents)],
    ],
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.6, textColor: SLATE, lineColor: LIGHT_BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 62, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 6) {
        data.cell.styles.fillColor = positive ? GREEN_BG : RED_BG;
        data.cell.styles.textColor = positive ? GREEN_TEXT : RED_TEXT;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 9;

  doc.setFillColor(...AMBER_BG);
  doc.setDrawColor(...AMBER_BORDER);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 27, 3, 3, "FD");
  doc.setTextColor(...AMBER_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("NEXT STEP — BUDGET CALL", MARGIN + 5, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text(
    `Collect ${money(report.next_budget_cents)} from each member and ${money(report.pending_contribution_cents)} from the pending member. ` +
      `This yields ${money(report.next_budget_cents * 5 + report.pending_contribution_cents)}, leaving a clean positive balance of ` +
      `${money(report.next_budget_cents * 5 + report.pending_contribution_cents + report.pool.pool_balance_cents)} for upcoming expenses.`,
    MARGIN + 5,
    y + 12,
    { maxWidth: PAGE_W - MARGIN * 2 - 10 },
  );
  doc.text(
    "Pending amounts may be settled directly through upcoming grocery purchases; no cash hand-over is required.",
    MARGIN + 5,
    y + 20,
    { maxWidth: PAGE_W - MARGIN * 2 - 10 },
  );

  y += 35;
  doc.setTextColor(...BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("MEMBER CONTRIBUTION STATUS", MARGIN, y);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 2, MARGIN + 48, y + 2);

  autoTable(doc, {
    startY: y + 5,
    head: [["Member", "Role", "Status", "Outstanding", "Note"]],
    body: report.member_status.map((member) => [
      member.display_name,
      member.is_admin ? "Admin / Member" : "Member",
      member.status === "pending" ? "ACTION REQUIRED" : "SETTLED",
      member.outstanding_cents > 0 ? money(member.outstanding_cents) : "—",
      member.status === "pending"
        ? member.status_note ?? "Pending Round 5 contribution."
        : "Settled.",
    ]),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.2, textColor: SLATE, lineColor: LIGHT_BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.2 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: "bold" },
      1: { cellWidth: 27 },
      2: { cellWidth: 31, fontStyle: "bold" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 61 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const member = report.member_status[data.row.index];
      if (!member) return;
      if (member.status === "pending") {
        data.cell.styles.fillColor = AMBER_BG;
        data.cell.styles.textColor = data.column.index === 2 ? AMBER_TEXT : SLATE;
      } else if (data.column.index === 2) {
        data.cell.styles.textColor = GREEN_TEXT;
      }
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const footerY = Math.min(finalY + 12, PAGE_H - 32);
  doc.setDrawColor(...LIGHT_BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, footerY, PAGE_W - MARGIN, footerY);
  doc.setTextColor(...GRAY_TEXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Prepared from the live FlatMate Hub ledger. All amounts are in euro (EUR).", MARGIN, footerY + 5);
  doc.text(
    `Generated ${new Date(report.generated_at).toLocaleString("en-GB")}`,
    PAGE_W - MARGIN,
    footerY + 5,
    { align: "right" },
  );
}

function drawPageFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    if (page === 1) {
      doc.setTextColor(...GRAY_TEXT);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text("FlatMate Hub · Financial audit ledger · Oct 2026", MARGIN, PAGE_H - 8);
      doc.text("Page 1", PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
      continue;
    }
    doc.setDrawColor(...LIGHT_BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    doc.setTextColor(...GRAY_TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("FlatMate Hub · Financial audit ledger · Oct 2026", MARGIN, PAGE_H - 8);
    doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }
}

export function downloadFinancialReport(report: FinancialReport) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({
    title: report.title,
    subject: report.subtitle,
    author: "FlatMate Hub",
    creator: "FlatMate Hub",
  });

  drawCover(doc, report);

  const sections = new Map<string, FinancialReportEntry[]>();
  for (const entry of report.entries) {
    const key = sectionFor(entry);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(entry);
  }

  let running = 0;
  for (const [section, entries] of sections) {
    doc.addPage();
    addContentHeader(doc, section, sectionRanges[section] ?? "");
    let y = 30;

    // Keep the running balance continuous across sections.
    const last = entries[entries.length - 1];
    running = last ? last.running_balance_cents : running;

    const finalY = drawEntriesTable(doc, entries, y);
    drawSectionSummary(doc, finalY, entries, running);
  }

  drawFinalSummary(doc, report);
  drawPageFooters(doc);

  doc.save("Flatmate-Financial-Audit-Report-Oct-2026.pdf");
}
