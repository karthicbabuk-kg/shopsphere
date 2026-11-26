import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireRole } from './RequireRole';
import { useAuth } from '../../store/auth';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/seller" element={<p>seller page</p>} />
        <Route element={<RequireRole roles={['ADMIN']} />}>
          <Route path="/admin" element={<p>admin page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const user = (role: 'BUYER' | 'SELLER' | 'ADMIN') => ({
  id: '1',
  email: 'x@y.z',
  name: 'X',
  phone: null,
  role,
});

describe('RequireRole', () => {
  it('redirects anonymous visitors to login', () => {
    useAuth.setState({ status: 'anon', user: null, accessToken: null });
    renderAt('/admin');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a seller away from admin routes to their own home', () => {
    useAuth.setState({ status: 'authed', user: user('SELLER'), accessToken: 't' });
    renderAt('/admin');
    expect(screen.getByText('seller page')).toBeInTheDocument();
  });

  it('sends a buyer away from admin routes to the storefront', () => {
    useAuth.setState({ status: 'authed', user: user('BUYER'), accessToken: 't' });
    renderAt('/admin');
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('renders the page for the permitted role', () => {
    useAuth.setState({ status: 'authed', user: user('ADMIN'), accessToken: 't' });
    renderAt('/admin');
    expect(screen.getByText('admin page')).toBeInTheDocument();
  });

  it('shows a loading state while the session is restored', () => {
    useAuth.setState({ status: 'loading', user: null, accessToken: null });
    renderAt('/admin');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
