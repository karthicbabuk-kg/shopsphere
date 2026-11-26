import TextField, { type TextFieldProps } from '@mui/material/TextField';
import type { FieldError } from 'react-hook-form';
import { forwardRef } from 'react';

type Props = Omit<TextFieldProps, 'error' | 'helperText'> & {
  error?: FieldError;
  hint?: string;
};

/** MUI TextField wired for react-hook-form: spread `register(...)` onto it. */
export const FormField = forwardRef<HTMLInputElement, Props>(function FormField(
  { error, hint, ...rest },
  ref,
) {
  return (
    <TextField
      fullWidth
      size="medium"
      inputRef={ref}
      error={!!error}
      helperText={error?.message ?? hint}
      {...rest}
    />
  );
});
