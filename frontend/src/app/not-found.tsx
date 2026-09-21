import Link from 'next/link';
import { Package } from 'lucide-react';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';

/** Any address that does not exist. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa]">
      <StoreNav />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-gray-400">
        <Package className="h-12 w-12 text-gray-200" />
        <h1 className="text-[18px] font-semibold text-gray-900">Page not found</h1>
        <p className="text-[14px]">The page you are looking for does not exist.</p>
        <Link href="/" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700">Back to the store</Link>
      </div>
      <StoreFooter />
    </div>
  );
}
