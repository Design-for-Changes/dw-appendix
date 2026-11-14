import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders appendix entry", () => {
  render(<App />);
  expect(screen.getByText("Web Appendix", { exact: true })).toBeInTheDocument();
});
