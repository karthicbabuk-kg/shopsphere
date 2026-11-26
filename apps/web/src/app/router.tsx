import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, Package, Store, Tags, Users, Warehouse } from 'lucide-react';
import CircularProgress from '@mui/material/CircularProgress';
import { StorefrontLayout } from '../layouts/StorefrontLayout';
import { PortalLayout, type NavItem } from '../layouts/PortalLayout';
import { RequireRole } from '../features/auth/RequireRole';
import { HomePage } from '../pages/storefront/HomePage';

/**
 * Route-level code splitting: only the home page ships in the first bundle. Each page below is
 * fetched when first visited. `page()` adapts a named export to React Router's lazy contract.
 */
const page = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load())[name] as ComponentType }),
});

const sellerNav: NavItem[] = [
  { to: '/seller', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/seller/products', label: 'Products', icon: <Package size={18} /> },
  { to: '/seller/orders', label: 'Orders', icon: <ClipboardList size={18} /> },
  { to: '/seller/inventory', label: 'Inventory', icon: <Warehouse size={18} /> },
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
    hydrateFallbackElement: (
      <div className="grid min-h-[40vh] place-items-center">
        <CircularProgress size={28} />
      </div>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', ...page(() => import('../pages/storefront/ListingPage'), 'ListingPage') },
      { path: '/c/:slug', ...page(() => import('../pages/storefront/ListingPage'), 'ListingPage') },
      { path: '/p/:slug', ...page(() => import('../pages/storefront/ProductPage'), 'ProductPage') },
      { path: '/login', ...page(() => import('../pages/auth/LoginPage'), 'LoginPage') },
      { path: '/register', ...page(() => import('../pages/auth/RegisterPage'), 'RegisterPage') },
      { path: '/seller/register', ...page(() => import('../pages/auth/SellerRegisterPage'), 'SellerRegisterPage') },
      { path: '/forgot-password', ...page(() => import('../pages/auth/ForgotPasswordPage'), 'ForgotPasswordPage') },
      { path: '/reset-password', ...page(() => import('../pages/auth/ResetPasswordPage'), 'ResetPasswordPage') },
      {
        element: <RequireRole roles={['BUYER']} />,
        children: [
          { path: '/account', ...page(() => import('../pages/buyer/AccountPage'), 'AccountPage') },
          { path: '/wishlist', ...page(() => import('../pages/storefront/WishlistPage'), 'WishlistPage') },
          { path: '/cart', ...page(() => import('../pages/storefront/CartPage'), 'CartPage') },
          { path: '/account/orders', ...page(() => import('../pages/buyer/OrdersPage'), 'OrdersPage') },
          { path: '/account/orders/:id', ...page(() => import('../pages/buyer/OrderDetailPage'), 'OrderDetailPage') },
          { path: '/account/addresses', ...page(() => import('../pages/buyer/AddressesPage'), 'AddressesPage') },
          { path: '/checkout', ...page(() => import('../pages/storefront/CheckoutPage'), 'CheckoutPage') },
        ],
      },
      { path: '*', ...page(() => import('../pages/NotFoundPage'), 'NotFoundPage') },
    ],
  },
  {
    // Invoices render without the storefront chrome so they print cleanly.
    element: <RequireRole roles={['BUYER']} />,
    children: [{ path: '/account/orders/:id/invoice/:sid', ...page(() => import('../pages/buyer/InvoicePage'), 'BuyerInvoicePage') }],
  },
  {
    element: <RequireRole roles={['SELLER']} />,
    children: [{ path: '/seller/orders/:id/invoice', ...page(() => import('../pages/seller/SellerInvoicePage'), 'SellerInvoicePage') }],
  },
  {
    element: <RequireRole roles={['SELLER']} />,
    children: [
      {
        element: <PortalLayout title="Seller portal" nav={sellerNav} />,
        children: [
          { path: '/seller', ...page(() => import('../pages/seller/SellerHomePage'), 'SellerHomePage') },
          { path: '/seller/products', ...page(() => import('../pages/seller/SellerProductsPage'), 'SellerProductsPage') },
          { path: '/seller/products/new', ...page(() => import('../pages/seller/SellerProductFormPage'), 'SellerProductFormPage') },
          { path: '/seller/products/:id', ...page(() => import('../pages/seller/SellerProductFormPage'), 'SellerProductFormPage') },
          { path: '/seller/orders', ...page(() => import('../pages/seller/SellerOrdersPage'), 'SellerOrdersPage') },
          { path: '/seller/orders/:id', ...page(() => import('../pages/seller/SellerOrderDetailPage'), 'SellerOrderDetailPage') },
          { path: '/seller/inventory', ...page(() => import('../pages/seller/SellerInventoryPage'), 'SellerInventoryPage') },
          { path: '/seller/store', ...page(() => import('../pages/seller/SellerStorePage'), 'SellerStorePage') },
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
          { path: '/admin', ...page(() => import('../pages/admin/AdminHomePage'), 'AdminHomePage') },
          { path: '/admin/sellers', ...page(() => import('../pages/admin/AdminSellersPage'), 'AdminSellersPage') },
          { path: '/admin/sellers/:id', ...page(() => import('../pages/admin/AdminSellerDetailPage'), 'AdminSellerDetailPage') },
          { path: '/admin/products', ...page(() => import('../pages/admin/AdminProductsPage'), 'AdminProductsPage') },
          { path: '/admin/products/:id', ...page(() => import('../pages/admin/AdminProductDetailPage'), 'AdminProductDetailPage') },
          { path: '/admin/catalog', ...page(() => import('../pages/admin/AdminCatalogPage'), 'AdminCatalogPage') },
        ],
      },
    ],
  },
]);
