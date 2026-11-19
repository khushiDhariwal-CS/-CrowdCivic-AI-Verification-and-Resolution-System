import Link from 'next/link';
import { Building2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F4F8FD] text-[#13345D] flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="bg-white border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] rounded-2xl p-8 max-w-md w-full shadow-[0_2px_12px_rgba(15,41,74,0.06)]">
        <div className="w-12 h-12 rounded-xl bg-[#133B6E] text-white flex items-center justify-center relative shadow-xs mx-auto mb-4">
          <Building2 className="w-6 h-6" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] absolute top-1.5 right-1.5" />
        </div>
        <p className="font-mono text-xs font-bold text-[#15427B] mb-1">404 · PAGE NOT FOUND</p>
        <h1 className="text-xl font-bold text-[#13345D] mb-2">This municipal page could not be found</h1>
        <p className="text-[#475569] text-sm mb-6 leading-relaxed">
          The page you are looking for does not exist or has been relocated within the CrowdCivic AI portal.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center w-full px-5 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}
