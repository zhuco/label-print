import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';

describe('App shell', () => {
  it('renders product title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '标签编辑打印' })).toBeInTheDocument();
  });
});
