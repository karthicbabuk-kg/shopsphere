import { createBrowserRouter } from 'react-router-dom';
import { StorefrontLayout } from '../layouts/StorefrontLayout';
import { HomePage } from '../pages/storefront/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <StorefrontLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
