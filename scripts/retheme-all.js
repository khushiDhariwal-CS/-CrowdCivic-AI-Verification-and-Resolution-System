const fs = require('fs');
const path = require('path');

function rethemeCitizen(content) {
  let res = content;

  // Root background
  res = res.replace(/min-h-screen bg-\[#07090e\] text-slate-200/g, 'min-h-screen bg-sky-50/50 text-slate-800');
  res = res.replace(/min-h-screen bg-\[#050505\]/g, 'min-h-screen bg-sky-50');

  // Header
  res = res.replace(/bg-\[#0b0f19\]\/80 backdrop-blur-md border-b border-white\/10/g, 'bg-white border-b border-sky-200 shadow-xs');
  res = res.replace(/bg-blue-500\/20 border border-blue-500\/30 flex items-center justify-center text-blue-400/g, 'bg-sky-600 flex items-center justify-center text-white shadow-xs');
  res = res.replace(/text-white font-semibold text-sm tracking-tight block/g, 'text-sky-950 font-bold text-sm tracking-tight block');
  res = res.replace(/text-\[10px\] text-blue-400 font-medium tracking-wider uppercase block/g, 'text-[10px] text-sky-600 font-semibold tracking-wider uppercase block');

  // Navigation
  res = res.replace(/hidden sm:flex items-center gap-1 bg-white\/5 p-1 rounded-xl border border-white\/10/g, 'hidden sm:flex items-center gap-1 bg-sky-100/70 p-1 rounded-xl border border-sky-200');
  res = res.replace(/activeTab === 'home' \? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'/g, "activeTab === 'home' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-sky-900'");
  res = res.replace(/activeTab === 'report' \? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'/g, "activeTab === 'report' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-sky-900'");
  res = res.replace(/activeTab === 'reports' \? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'/g, "activeTab === 'reports' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-sky-900'");
  res = res.replace(/activeTab === 'explore' \? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'/g, "activeTab === 'explore' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-sky-900'");
  
  // User pill and sign out
  res = res.replace(/bg-white\/5 border border-white\/10 text-xs text-slate-300/g, 'bg-white border border-sky-200 text-xs text-slate-700 shadow-xs');
  res = res.replace(/text-\[11px\] font-medium text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white\/10 hover:bg-white\/5/g, 'text-[11px] font-medium text-slate-600 hover:text-rose-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50');

  // Mobile Tab bar
  res = res.replace(/pb-4 mb-4 border-b border-white\/10/g, 'pb-4 mb-4 border-b border-sky-200');
  res = res.replace(/bg-blue-600 text-white/g, 'bg-sky-600 text-white');
  res = res.replace(/bg-white\/5 text-slate-400/g, 'bg-white border border-sky-200 text-slate-600');

  // Quick Action Banner
  res = res.replace(/bg-gradient-to-r from-blue-900\/40 via-indigo-900\/20 to-slate-900\/60 border border-blue-500\/20 p-6 sm:p-8 mb-8/g, 'bg-gradient-to-r from-sky-100 via-sky-50 to-white border border-sky-200 p-6 sm:p-8 mb-8 shadow-xs');
  res = res.replace(/bg-blue-500\/20 border border-blue-400\/30 text-blue-300 text-\[11px\] font-medium mb-3/g, 'bg-sky-200/60 border border-sky-300 text-sky-800 text-[11px] font-semibold mb-3');
  res = res.replace(/text-xl sm:text-2xl font-semibold text-white mb-2/g, 'text-xl sm:text-2xl font-bold text-sky-950 mb-2');
  res = res.replace(/text-xs sm:text-sm text-slate-300 leading-relaxed mb-6/g, 'text-xs sm:text-sm text-slate-600 leading-relaxed mb-6');
  res = res.replace(/px-5 py-2.5 bg-white\/10 hover:bg-white\/15 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 border border-white\/10/g, 'px-5 py-2.5 bg-white hover:bg-sky-50 text-sky-900 text-xs font-semibold rounded-xl flex items-center gap-2 border border-sky-200 shadow-xs');

  // Card containers
  res = res.replace(/bg-\[#0e1320\]/g, 'bg-white');
  res = res.replace(/bg-\[#0b0f19\]/g, 'bg-white');
  res = res.replace(/bg-\[#050810\]/g, 'bg-sky-50/70');
  res = res.replace(/bg-\[#0b1120\]/g, 'bg-sky-50');
  
  // Specific inputs
  res = res.replace(/bg-\[#07090e\] border border-white\/10 rounded-xl px-3.5 py-2.5 text-xs text-white/g, 'bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs text-slate-900');
  res = res.replace(/bg-\[#07090e\] border border-white\/10 rounded-lg px-3 py-2 text-xs text-white/g, 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900');
  res = res.replace(/bg-\[#07090e\] border text-xs text-white placeholder-slate-500/g, 'bg-white border text-xs text-slate-900 placeholder-slate-400');
  res = res.replace(/bg-\[#07090e\]/g, 'bg-white');

  // Borders
  res = res.replace(/border-white\/10/g, 'border-sky-200');
  res = res.replace(/border-white\/5/g, 'border-sky-100');
  res = res.replace(/border-white\/20/g, 'border-sky-300');

  // Inner backgrounds
  res = res.replace(/bg-white\/5 hover:bg-white\/10 border border-sky-100/g, 'bg-sky-50/50 hover:bg-sky-100/60 border border-sky-100');
  res = res.replace(/bg-white\/5/g, 'bg-sky-50/50');
  res = res.replace(/bg-white\/10/g, 'bg-sky-100/60');

  // Text & headings
  res = res.replace(/text-2xl sm:text-3xl font-bold text-white tracking-tight/g, 'text-2xl sm:text-3xl font-bold text-sky-950 tracking-tight');
  res = res.replace(/font-semibold text-white text-base mb-1/g, 'font-bold text-slate-900 text-base mb-1');
  res = res.replace(/text-base font-semibold text-white/g, 'text-base font-bold text-slate-900');
  res = res.replace(/text-lg font-bold text-white/g, 'text-lg font-bold text-slate-900');
  res = res.replace(/text-xl font-bold text-white/g, 'text-xl font-bold text-slate-900');
  res = res.replace(/text-2xl font-bold text-white/g, 'text-2xl font-bold text-slate-900');
  res = res.replace(/text-xs font-semibold text-white truncate/g, 'text-xs font-semibold text-slate-900 truncate');
  res = res.replace(/text-sm font-semibold text-white/g, 'text-sm font-semibold text-slate-900');

  // Dropzone
  res = res.replace(/border-blue-500\/30 hover:border-blue-400\/60 bg-blue-950\/10 hover:bg-blue-950\/20/g, 'border-sky-300 hover:border-sky-400 bg-sky-50/50 hover:bg-sky-100/40');

  // Buttons
  res = res.replace(/bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500/g, 'bg-sky-600 hover:bg-sky-700');
  res = res.replace(/bg-blue-600 hover:bg-blue-500/g, 'bg-sky-600 hover:bg-sky-700');
  res = res.replace(/text-blue-400/g, 'text-sky-700');
  res = res.replace(/bg-blue-500\/10/g, 'bg-sky-100');
  res = res.replace(/border-blue-500\/20/g, 'border-sky-200');

  // Modal backdrop
  res = res.replace(/fixed inset-0 z-50 bg-black\/80 backdrop-blur-sm/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');
  res = res.replace(/fixed inset-0 z-50 bg-black\/80/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');
  res = res.replace(/fixed inset-0 z-50 bg-black\/90/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');

  return res;
}

function rethemeAuthority(content) {
  let res = content;

  // Root background
  res = res.replace(/min-h-screen bg-\[#07090e\] text-slate-200/g, 'min-h-screen bg-sky-50/50 text-slate-800');
  res = res.replace(/min-h-screen bg-\[#050505\]/g, 'min-h-screen bg-sky-50');

  // Header
  res = res.replace(/bg-\[#0b0f19\]\/80 backdrop-blur-md border-b border-white\/10/g, 'bg-white border-b border-sky-200 shadow-xs');
  res = res.replace(/bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white/g, 'bg-sky-600 flex items-center justify-center text-white shadow-xs');
  res = res.replace(/text-white font-bold text-sm tracking-tight block/g, 'text-sky-950 font-bold text-sm tracking-tight block');
  res = res.replace(/text-\[10px\] text-emerald-400 font-mono tracking-wider uppercase block/g, 'text-[10px] text-emerald-700 font-semibold tracking-wider uppercase block');

  // User pill and sign out
  res = res.replace(/bg-white\/5 border border-white\/10 text-xs text-slate-300/g, 'bg-white border border-sky-200 text-xs text-slate-700 shadow-xs');
  res = res.replace(/text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white\/10 hover:bg-white\/5/g, 'text-xs font-medium text-slate-600 hover:text-rose-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50');

  // Main title
  res = res.replace(/text-2xl sm:text-3xl font-bold text-white tracking-tight/g, 'text-2xl sm:text-3xl font-bold text-sky-950 tracking-tight');
  res = res.replace(/px-3.5 py-2 bg-white\/5 hover:bg-white\/10 text-slate-300 text-xs font-medium rounded-xl border border-white\/10/g, 'px-3.5 py-2 bg-white hover:bg-sky-50 text-slate-700 text-xs font-medium rounded-lg border border-sky-200 shadow-xs');

  // Metric cards
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-xl border border-white\/10/g, 'bg-white p-4 rounded-xl border border-sky-200 shadow-sm');
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-xl border border-amber-500\/20/g, 'bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm');
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-xl border border-blue-500\/20/g, 'bg-sky-50/50 p-4 rounded-xl border border-sky-200 shadow-sm');
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-xl border border-emerald-500\/20/g, 'bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-sm');
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-xl border border-red-500\/20/g, 'bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm');
  res = res.replace(/text-2xl font-bold font-mono text-white/g, 'text-2xl font-bold font-mono text-slate-900');
  res = res.replace(/text-2xl font-bold font-mono text-amber-300/g, 'text-2xl font-bold font-mono text-amber-800');
  res = res.replace(/text-2xl font-bold font-mono text-blue-300/g, 'text-2xl font-bold font-mono text-sky-800');
  res = res.replace(/text-2xl font-bold font-mono text-emerald-300/g, 'text-2xl font-bold font-mono text-emerald-800');
  res = res.replace(/text-2xl font-bold font-mono text-red-300/g, 'text-2xl font-bold font-mono text-rose-800');

  // Toolbar & inputs
  res = res.replace(/bg-\[#0e1320\] p-4 rounded-2xl border border-white\/10 mb-6/g, 'bg-white p-4 rounded-xl border border-sky-200 mb-6 shadow-sm');
  res = res.replace(/w-full bg-\[#07090e\] border border-white\/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white/g, 'w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900');
  res = res.replace(/bg-\[#07090e\] border border-white\/10 rounded-xl px-3 py-2 text-xs text-slate-300/g, 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700');

  // Other card elements
  res = res.replace(/bg-\[#0e1320\]/g, 'bg-white');
  res = res.replace(/bg-\[#07090e\]/g, 'bg-white');
  res = res.replace(/bg-\[#0b0f19\]/g, 'bg-white');
  res = res.replace(/bg-\[#0f172a\]/g, 'bg-white');
  res = res.replace(/border-white\/10/g, 'border-sky-200');
  res = res.replace(/border-white\/20/g, 'border-sky-300');
  res = res.replace(/bg-white\/5/g, 'bg-sky-50/50');
  res = res.replace(/bg-white\/10/g, 'bg-sky-100/60');
  res = res.replace(/text-white/g, 'text-slate-900');

  // Fix button text where text-slate-900 was erroneously applied
  res = res.replace(/bg-sky-600(.*?)text-slate-900/g, 'bg-sky-600$1text-white');
  res = res.replace(/bg-emerald-600(.*?)text-slate-900/g, 'bg-emerald-600$1text-white');
  res = res.replace(/bg-blue-600(.*?)text-slate-900/g, 'bg-sky-600$1text-white');
  res = res.replace(/bg-red-600(.*?)text-slate-900/g, 'bg-rose-600$1text-white');

  // Modal backdrop
  res = res.replace(/fixed inset-0 z-50 bg-black\/80 backdrop-blur-sm/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');
  res = res.replace(/fixed inset-0 z-50 bg-black\/80/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');

  return res;
}

function rethemeAdmin(content) {
  let res = content;

  // Root background
  res = res.replace(/min-h-screen bg-\[#050505\] text-slate-200/g, 'min-h-screen bg-sky-50/40 text-slate-800');

  // Sidebar
  res = res.replace(/w-64 bg-\[#0a0a0a\] border-r border-white\/10/g, 'w-64 bg-white border-r border-sky-200 shadow-xs');
  res = res.replace(/h-16 flex items-center px-6 border-b border-white\/10/g, 'h-16 flex items-center px-6 border-b border-sky-100');
  res = res.replace(/text-white font-serif italic tracking-tight font-semibold block text-sm/g, 'text-sky-950 font-bold tracking-tight block text-sm');
  res = res.replace(/text-\[9px\] uppercase tracking-widest text-emerald-400 font-mono/g, 'text-[9px] uppercase tracking-wider text-sky-700 font-semibold');
  res = res.replace(/text-white\/40/g, 'text-slate-500');
  res = res.replace(/text-white\/60 hover:bg-white\/5 hover:text-white/g, 'text-slate-600 hover:bg-sky-50 hover:text-sky-900');
  res = res.replace(/bg-emerald-500\/10 border border-emerald-500\/30 text-emerald-300/g, 'bg-sky-100 border border-sky-300 text-sky-900');
  res = res.replace(/p-4 border-t border-white\/10 space-y-3/g, 'p-4 border-t border-sky-100 space-y-3');
  res = res.replace(/bg-emerald-950\/40 rounded-xl border border-emerald-500\/30 text-\[11px\] text-emerald-300/g, 'bg-sky-50 rounded-xl border border-sky-200 text-[11px] text-sky-900');
  res = res.replace(/text-emerald-400\/80/g, 'text-sky-700');
  res = res.replace(/text-white\/40 hover:text-white hover:bg-white\/5/g, 'text-slate-600 hover:text-rose-600 hover:bg-slate-50');

  // Main Header
  res = res.replace(/h-16 bg-\[#0a0a0a\]\/50 backdrop-blur-md border-b border-white\/10/g, 'h-16 bg-white border-b border-sky-200 shadow-xs');
  res = res.replace(/text-base font-semibold text-white/g, 'text-base font-bold text-slate-900');
  res = res.replace(/text-white font-mono/g, 'text-slate-900 font-mono font-medium');

  // KPI cards & Content Cards
  res = res.replace(/bg-\[#0a0a0a\]\/50/g, 'bg-white');
  res = res.replace(/bg-\[#0a0a0a\]/g, 'bg-white');
  res = res.replace(/bg-\[#0e1320\]/g, 'bg-white');
  res = res.replace(/bg-\[#0f172a\]/g, 'bg-white');

  // Borders
  res = res.replace(/border-white\/10/g, 'border-sky-200');
  res = res.replace(/border-white\/20/g, 'border-sky-300');
  res = res.replace(/bg-white\/5/g, 'bg-sky-50/50');
  res = res.replace(/bg-white\/10/g, 'bg-sky-100/60');

  // Text
  res = res.replace(/text-white/g, 'text-slate-900');
  res = res.replace(/bg-sky-600(.*?)text-slate-900/g, 'bg-sky-600$1text-white');
  res = res.replace(/bg-emerald-600(.*?)text-slate-900/g, 'bg-emerald-600$1text-white');
  res = res.replace(/bg-red-600(.*?)text-slate-900/g, 'bg-rose-600$1text-white');

  // Modals
  res = res.replace(/fixed inset-0 z-50 bg-black\/80 backdrop-blur-sm/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');
  res = res.replace(/fixed inset-0 z-50 bg-black\/80/g, 'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs');

  return res;
}

const citizenPath = path.join(__dirname, '../app/citizen/page.tsx');
const authorityPath = path.join(__dirname, '../app/authority/page.tsx');
const adminPath = path.join(__dirname, '../app/admin/page.tsx');

fs.writeFileSync(citizenPath, rethemeCitizen(fs.readFileSync(citizenPath, 'utf8')));
console.log('Rethemed citizen page');

fs.writeFileSync(authorityPath, rethemeAuthority(fs.readFileSync(authorityPath, 'utf8')));
console.log('Rethemed authority page');

fs.writeFileSync(adminPath, rethemeAdmin(fs.readFileSync(adminPath, 'utf8')));
console.log('Rethemed admin page');
