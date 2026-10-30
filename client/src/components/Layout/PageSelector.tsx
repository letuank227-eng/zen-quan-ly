import React, { useState, useRef, useEffect } from 'react';
import { usePages } from '../../context/PageContext';
import { ChevronDown, Check, Layers, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PageSelector: React.FC = () => {
  const { pages, selectedPageId, setSelectedPageId, hasConnectedPages } = usePages();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!hasConnectedPages) {
    return (
      <Link
        to="/settings?tab=meta"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition shadow-sm"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span>Chưa kết nối Meta Page</span>
        <Plus className="w-3.5 h-3.5 ml-1" />
      </Link>
    );
  }

  const selectedPage = pages.find((p) => p.id === selectedPageId);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-800 bg-white border border-slate-200 hover:border-brand-500 rounded-lg shadow-sm hover:bg-brand-50/30 transition focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {selectedPageId === 'all' ? (
          <>
            <div className="w-5 h-5 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-slate-900">Tất cả Page ({pages.length})</span>
          </>
        ) : (
          <>
            {selectedPage?.avatar ? (
              <img
                src={selectedPage.avatar}
                alt={selectedPage.name}
                className="w-5 h-5 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs">
                {selectedPage?.name?.[0]?.toUpperCase() || 'P'}
              </div>
            )}
            <span className="font-semibold text-slate-900 truncate max-w-[140px] sm:max-w-[200px]">
              {selectedPage?.name}
            </span>
          </>
        )}
        <ChevronDown className="w-4 h-4 text-slate-500 transition-transform duration-200" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-white shadow-xl border border-slate-100 ring-1 ring-black ring-opacity-5 z-50 py-1 divide-y divide-slate-100">
          <div className="p-1">
            <button
              onClick={() => {
                setSelectedPageId('all');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                selectedPageId === 'all'
                  ? 'bg-brand-50 text-brand-900 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span>Tất cả Page ({pages.length})</span>
              </div>
              {selectedPageId === 'all' && <Check className="w-4 h-4 text-brand-600" />}
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  setSelectedPageId(page.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                  selectedPageId === page.id
                    ? 'bg-brand-50 text-brand-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {page.avatar ? (
                    <img
                      src={page.avatar}
                      alt={page.name}
                      className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {page.name[0]?.toUpperCase() || 'P'}
                    </div>
                  )}
                  <span className="truncate text-left">{page.name}</span>
                </div>
                {selectedPageId === page.id && <Check className="w-4 h-4 text-brand-600 shrink-0 ml-2" />}
              </button>
            ))}
          </div>

          <div className="p-1">
            <Link
              to="/settings?tab=meta"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-brand-700 hover:bg-brand-50 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Quản lý & Thêm Page</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
