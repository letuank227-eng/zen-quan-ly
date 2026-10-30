import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Inbox, MessageSquare, Users, Settings } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export const MobileNav: React.FC = () => {
  const { unreadCount } = useNotifications();

  const items = [
    { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/inbox', label: 'Inbox', icon: Inbox, badge: unreadCount > 0 ? unreadCount : undefined },
    { to: '/messenger', label: 'Chat', icon: MessageSquare },
    { to: '/customers', label: 'Khách hàng', icon: Users },
    { to: '/settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 safe-bottom">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium transition relative ${
                  isActive ? 'text-brand-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              <div className="relative">
                <Icon className="w-5 h-5 mb-0.5" />
                {item.badge && (
                  <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};
