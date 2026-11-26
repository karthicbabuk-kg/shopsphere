import { createBrowserRouter } from 'react-router-dom';
import { LayoutDashboard, Store, Users } from 'lucide-react';
import { StorefrontLayout } from '../layouts/StorefrontLayout';
import { PortalLayout, type NavItem } from '../layouts/PortalLayout';
import { RequireRole } from '../features/auth/RequireRole';
import { HomePage } from '../pages/storefront/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { SellerRegisterPage } from '../pages/auth/SellerRegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { AccountPage } from '../pages/buyer/AccountPage';
import { SellerHomePage } from '../pages/seller/SellerHomePage';
import { SellerStorePage } from '../pages/seller/SellerStorePage';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { AdminSellersPage } from '../pages/admin/AdminSellersPage';
import { AdminSellerDetailPage } from '../pages/admin/AdminSellerDetailPage';

const sellerNav: NavItem[] = [
  { to: '/seller', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/seller/store', label: 'Store profile', icon: <Store size={18} /> },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/admin/sellers', label: 'Sellers', icon: <Users size={18} /> },
];

export const router = createBrowserRouter([
  {
    element: <StorefrontLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/seller/register', element: <SellerRegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireRole roles={['BUYER']} />,
        children: [{ path: '/account', element: <AccountPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <RequireRole roles={['SELLER']} />,
    children: [
      {
        element: <PortalLayout title="Seller portal" nav={sellerNav} />,
        children: [
          { path: '/seller', element: <SellerHomePage /> },
          { path: '/seller/store', element: <SellerStorePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole roles={['ADMIN']} />,
    children: [
      {
        element: <PortalLayout title="Admin portal" nav={adminNav} />,
        children: [
          { path: '/admin', element: <AdminHomePage /> },
          { path: '/admin/sellers', element: <AdminSellersPage /> },
          { path: '/admin/sellers/:id', element: <AdminSellerDetailPage /> },
        ],
      },
    ],
  },
]);
