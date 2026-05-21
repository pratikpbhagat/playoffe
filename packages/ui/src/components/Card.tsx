import { cn } from '../utils';

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-xl bg-white shadow-sm ring-1 ring-gray-200', className)}
    >
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('border-b border-gray-100 px-6 py-4', className)}>
      {children}
    </div>
  );
};

Card.Body = function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('px-6 py-5', className)}>
      {children}
    </div>
  );
};
