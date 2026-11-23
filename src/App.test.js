import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders appendix entry", () => {
  render(<App />);
  expect(screen.getByText("Web Appendix", { exact: true })).toBeInTheDocument();
  const date = document.querySelector(".appendix-hero time");
  expect(date).toHaveAttribute("datetime", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  const [year, month, day] = date.dateTime.split("-").map(Number);
  expect(date).toHaveTextContent(`${year}年${month}月${day}日`);
});
