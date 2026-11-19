'use client';

import React from 'react';

export function StatusDot({
  status,
  isDisputed,
  adminFlagged,
  className = '',
}: {
  status: string;
  isDisputed?: boolean;
  adminFlagged?: boolean;
  className?: string;
}) {
  let dotColor = 'bg-[#13345D]';
  let textColor = 'text-[#13345D]';
  let label = status || 'Submitted';

  if (adminFlagged) {
    dotColor = 'bg-[#DC2626]';
    textColor = 'text-[#DC2626]';
    label = 'Flagged';
  } else if (isDisputed) {
    dotColor = 'bg-[#7C3AED]';
    textColor = 'text-[#7C3AED]';
    label = 'Disputed';
  } else if (status === 'Resolved' || status === 'Closed' || status === 'ALLOWED' || status === 'Enforced' || status === 'Active' || status === 'Operational' || status === 'Verified') {
    dotColor = 'bg-[#0E8A4E]';
    textColor = 'text-[#13345D]';
  } else if (status === 'In Progress') {
    dotColor = 'bg-[#15427B]';
    textColor = 'text-[#13345D]';
  } else if (status === 'Resolution Failed' || status === 'Rejected' || status === 'DENIED') {
    dotColor = 'bg-[#DC2626]';
    textColor = 'text-[#DC2626]';
  } else if (status === 'Under Verification') {
    dotColor = 'bg-[#F59E0B]';
    textColor = 'text-[#13345D]';
    label = 'Under review';
  } else if (status === 'Community Verification') {
    dotColor = 'bg-[#7C3AED]';
    textColor = 'text-[#7C3AED]';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
}

export function SeverityDot({
  severity,
  suffix = 'priority',
  className = '',
}: {
  severity: string;
  suffix?: string;
  className?: string;
}) {
  const s = (severity || 'Medium').toLowerCase();
  let dotColor = 'bg-[#13345D]';
  let textColor = 'text-[#13345D]';

  if (s === 'critical') {
    dotColor = 'bg-[#DC2626]';
    textColor = 'text-[#DC2626]';
  } else if (s === 'high') {
    dotColor = 'bg-[#F59E0B]';
    textColor = 'text-[#D97706]';
  } else if (s === 'low') {
    dotColor = 'bg-[#64748B]';
    textColor = 'text-[#475569]';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{suffix ? `${severity} ${suffix}` : severity}</span>
    </span>
  );
}
