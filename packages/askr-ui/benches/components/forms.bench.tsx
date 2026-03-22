import { bench, describe } from 'vitest';
import { Field, FieldControl } from '../../src/components/field';
import { Input } from '../../src/components/input';
import { Label } from '../../src/components/label';
import { RadioGroup, RadioGroupItem } from '../../src/components/radio-group';
import { Separator } from '../../src/components/separator';
import { Switch } from '../../src/components/switch';
import { Textarea } from '../../src/components/textarea';
import { VisuallyHidden } from '../../src/components/visually-hidden';

describe('Form benches', () => {
  bench('create field primitives', () => {
    Field({
      id: 'email',
      children: [
        Label({ children: 'Email' }),
        FieldControl({
          fieldId: 'email',
          children: Input({ type: 'email', value: 'jane@example.com' }),
        }),
      ],
    });
    Textarea({ value: 'Notes' });
    Separator({});
    VisuallyHidden({ children: 'Hidden label' });
  });

  bench('create radio group and switch', () => {
    RadioGroup({
      defaultValue: 'one',
      children: [
        RadioGroupItem({ value: 'one', children: 'One' }),
        RadioGroupItem({ value: 'two', children: 'Two' }),
      ],
    });
    Switch({ defaultChecked: true, children: 'Enabled' });
  });
});
