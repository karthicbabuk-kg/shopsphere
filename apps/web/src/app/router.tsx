import { createBrowserRouter } from 'react-router-dom';
import { LayoutDashboard, Package, Store, Tags, Users } from 'lucide-react';
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
import { AdminProductsPage } from '../pages/admin/AdminProductsPage';
import { AdminProductDetailPage } from '../pages/admin/AdminProductDetailPage';
import { AdminCatalogPage } from '../pages/admin/AdminCatalogPage';
import { SellerProductsPage } from '../pages/seller/SellerProductsPage';
import { SellerProductFormPage } from '../pages/seller/SellerProductFormPage';

const sellerNav: NavItem[] = [
  { to: '/seller', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/seller/products', label: 'Products', icon: <Package size={18} /> },
  { to: '/seller/store', label: 'Store profile', icon: <Store size={18} /> },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/admin/sellers', label: 'Sellers', icon: <Users size={18} /> },
  { to: '/admin/products', label: 'Products', icon: <Package size={18} /> },
  { to: '/admin/catalog', label: 'Catalogue', icon: <Tags size={18} /> },
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
          { path: '/seller/products', element: <SellerProductsPage /> },
          { path: '/seller/products/new', element: <SellerProductFormPage /> },
          { path: '/seller/products/:id', element: <SellerProductFormPage /> },
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
          { path: '/admin/products', element: <AdminProductsPage /> },
          { path: '/admin/products/:id', element: <AdminProductDetailPage /> },
          { path: '/admin/catalog', element: <AdminCatalogPage /> },
        ],
      },
    ],
  },
]);
