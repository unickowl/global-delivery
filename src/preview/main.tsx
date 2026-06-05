import React from "react"
import ReactDOM from "react-dom/client"
import { DashboardPreview } from "./DashboardPreview"
import "../styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DashboardPreview />
  </React.StrictMode>,
)
