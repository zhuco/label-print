import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '../../../App';

describe('Editor page shell', () => {
  it('renders heading and three-pane labels', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '标签编辑打印' })).toBeInTheDocument();
    expect(screen.getByText('元素')).toBeInTheDocument();
    expect(screen.getByText('属性')).toBeInTheDocument();
  });
});