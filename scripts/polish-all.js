const fs = require('fs');
const path = require('path');

function polishCitizen(content) {
  let res = content;

  // Image containers & overlays
  res = res.replace(/bg-black\/50/g, 'bg-slate-100');
  res = res.replace(/bg-black\/40/g, 'bg-slate-100');
  res = res.replace(/bg-black\/30/g, 'bg-sky-50');
  res = res.replace(/border-white\/15/g, 'border-sky-200');
  res = res.replace(/border-white\/5/g, 'border-sky-100');
  
  // Image tags
  res = res.replace(/bg-black\/70 backdrop-blur-md px-2.5 py-1 rounded-md text-\[10px\] font-mono font-bold text-sky-700 border border-sky-300/g, 
    'bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-sky-900 border border-sky-200 shadow-xs');
  
  // Modal wrappers
  res = res.replace(/fixed inset-0 z-50 bg-black\/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto/g,
    'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto');

  // Text adjustments
  res = res.replace(/text-slate-300/g, 'text-slate-700');
  res = res.replace(/text-slate-400/g, 'text-slate-600');
  res = res.replace(/placeholder-slate-500/g, 'placeholder-slate-400');
  res = res.replace(/focus:border-blue-500/g, 'focus:border-sky-600 focus:ring-1 focus:ring-sky-600');
  
  // Specific tag background
  res = res.replace(/bg-blue-950\/40/g, 'bg-sky-50');
  res = res.replace(/bg-blue-950\/30/g, 'bg-sky-50');
  res = res.replace(/bg-blue-950\/20/g, 'bg-sky-50');
  res = res.replace(/bg-blue-950\/10/g, 'bg-sky-50');

  return res;
}

function polishAuthority(content) {
  let res = content;

  res = res.replace(/border-white\/5/g, 'border-sky-100');
  res = res.replace(/fixed inset-0 z-50 bg-black\/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto/g,
    'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto');

  // Camera video overlays - keep camera hud legible with high contrast
  res = res.replace(/bg-black\/80 backdrop-blur-md border border-sky-300 text-blue-400 font-mono text-\[11px\] font-bold/g,
    'bg-white/95 px-2 py-0.5 rounded-md text-sky-900 font-mono text-[11px] font-bold border border-sky-200 shadow-xs');

  res = res.replace(/text-slate-300/g, 'text-slate-700');
  res = res.replace(/text-slate-400/g, 'text-slate-600');
  res = res.replace(/placeholder-slate-500/g, 'placeholder-slate-400');
  res = res.replace(/focus:border-blue-500/g, 'focus:border-sky-600 focus:ring-1 focus:ring-sky-600');

  // Status cards fix where text might need contrast
  res = res.replace(/text-amber-400 uppercase tracking-wider/g, 'text-amber-700 font-bold uppercase tracking-wider');
  res = res.replace(/text-blue-400 uppercase tracking-wider/g, 'text-sky-700 font-bold uppercase tracking-wider');
  res = res.replace(/text-emerald-400 uppercase tracking-wider/g, 'text-emerald-700 font-bold uppercase tracking-wider');
  res = res.replace(/text-red-400 uppercase tracking-wider/g, 'text-rose-700 font-bold uppercase tracking-wider');

  return res;
}

function polishAdmin(content) {
  let res = content;

  // Clean inputs & search
  res = res.replace(/className="bg-black\/50 border border-sky-200 focus:border-emerald-500 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-xl outline-none"/g,
    'className="bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-lg outline-none"');
  
  res = res.replace(/className="flex bg-black\/50 border border-sky-200 p-1 rounded-xl text-xs"/g,
    'className="flex bg-sky-100/70 border border-sky-200 p-1 rounded-lg text-xs"');

  res = res.replace(/className="w-full bg-black\/50 border border-sky-200 focus:border-blue-500 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-xl outline-none"/g,
    'className="w-full bg-white border border-slate-300 focus:border-sky-600 focus:ring-1 focus:ring-sky-600 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-lg outline-none"');

  res = res.replace(/className="bg-black\/50 border border-sky-200 focus:border-amber-500 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-xl outline-none"/g,
    'className="bg-white border border-slate-300 focus:border-amber-600 focus:ring-1 focus:ring-amber-600 text-xs text-slate-900 pl-8 pr-3 py-1.5 rounded-lg outline-none"');

  res = res.replace(/className="p-4 bg-black\/40 border border-sky-200 rounded-xl space-y-2"/g,
    'className="p-4 bg-sky-50/50 border border-sky-200 rounded-lg space-y-2"');

  res = res.replace(/border border-white\/5/g, 'border border-sky-100');
  res = res.replace(/text-slate-300/g, 'text-slate-700');
  res = res.replace(/text-slate-400/g, 'text-slate-600');
  res = res.replace(/placeholder-slate-500/g, 'placeholder-slate-400');

  // Fix buttons & badges text
  res = res.replace(/bg-emerald-500\/10 border border-emerald-500\/30 text-emerald-300 font-bold/g,
    'bg-sky-100 border border-sky-300 text-sky-900 font-semibold');

  res = res.replace(/bg-emerald-500\/20 text-emerald-300 border border-emerald-500\/30/g,
    'bg-emerald-100 text-emerald-800 border border-emerald-200');

  return res;
}

const citizenPath = path.join(__dirname, '../app/citizen/page.tsx');
const authorityPath = path.join(__dirname, '../app/authority/page.tsx');
const adminPath = path.join(__dirname, '../app/admin/page.tsx');

fs.writeFileSync(citizenPath, polishCitizen(fs.readFileSync(citizenPath, 'utf8')));
console.log('Polished citizen page');

fs.writeFileSync(authorityPath, polishAuthority(fs.readFileSync(authorityPath, 'utf8')));
console.log('Polished authority page');

fs.writeFileSync(adminPath, polishAdmin(fs.readFileSync(adminPath, 'utf8')));
console.log('Polished admin page');
