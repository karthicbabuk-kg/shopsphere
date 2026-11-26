import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders the brand name', () => {
    render(<Logo />);
    expect(screen.getByText(/Shop/)).toBeInTheDocument();
  });
});
