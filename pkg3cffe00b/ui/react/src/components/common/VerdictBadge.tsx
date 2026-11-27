import { CheckCircle2, CircleSlash, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VerdictBadgeProps {
  verdict?: string;
  size?: 'sm' | 'md';
}

/** Colored badge for an execution or step verdict (Passed/Pass, Failed/Fail, Error, Skipped, ...). */
export default function VerdictBadge({ verdict, size = 'sm' }: VerdictBadgeProps) {
  const v = (verdict ?? 'Unknown').toLowerCase();
  if (v === 'passed' || v === 'pass') {
    return (
      <Badge variant="soft" appearance="success" size={size} leadingIcon={<CheckCircle2 />}>
        {verdict}
      </Badge>
    );
  }
  if (v === 'failed' || v === 'fail') {
    return (
      <Badge variant="soft" appearance="danger" size={size} leadingIcon={<XCircle />}>
        {verdict}
      </Badge>
    );
  }
  if (v === 'skipped') {
    return (
      <Badge variant="soft" appearance="secondary" size={size} leadingIcon={<CircleSlash />}>
        {verdict}
      </Badge>
    );
  }
  return (
    <Badge variant="soft" appearance="warning" size={size} leadingIcon={<AlertTriangle />}>
      {verdict ?? 'Unknown'}
    </Badge>
  );
}
