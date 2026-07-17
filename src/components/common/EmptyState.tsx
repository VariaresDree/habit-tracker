import type { ReactNode } from 'react';

export default function EmptyState({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {children}
    </div>
  );
}
