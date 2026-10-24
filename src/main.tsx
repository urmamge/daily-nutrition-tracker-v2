import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";
import "dayjs/locale/en-gb";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { App } from "./App.tsx";

const theme = createTheme({
  primaryColor: "violet",
  defaultRadius: "md",
  fontFamily: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
  headings: { fontFamily: '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, sans-serif' },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <DatesProvider settings={{ locale: "en-gb", firstDayOfWeek: 1 }}>
        <ModalsProvider>
          <Notifications position="bottom-right" />
          <App />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
