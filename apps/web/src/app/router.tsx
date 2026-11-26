import { createBrowserRouter } from 'react-router-dom';
import { StorefrontLayout } from '../layouts/StorefrontLayout';
import { PortalLayout } from '../layouts/PortalLayout';
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
import { AdminHomePage } from '../pages/admin/AdminHomePage';

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
        element: <PortalLayout title="Seller portal" />,
        children: [{ path: '/seller', element: <SellerHomePage /> }],
      },
    ],
  },
  {
    element: <RequireRole roles={['ADMIN']} />,
    children: [
      {
        element: <PortalLayout title="Admin portal" />,
        children: [{ path: '/admin', element: <AdminHomePage /> }],
      },
    ],
  },
]);
