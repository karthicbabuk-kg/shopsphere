import { createTheme } from '@mui/material/styles';
import { tokens } from '@shopsphere/shared-config';

const c = tokens.color;

export const theme = createTheme({
  palette: {
    primary: { main: c.blue600, dark: c.blue700, contrastText: '#fff' },
    secondary: { main: c.navy700 },
    warning: { main: c.warning },
    success: { main: c.success },
    error: { main: c.danger },
    text: { primary: c.ink, secondary: c.muted },
    background: { default: c.canvas, paper: c.surface },
    divider: c.line,
  },
  shape: { borderRadius: tokens.radius.md },
  typography: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
