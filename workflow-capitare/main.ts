import { Runner } from "@chainlink/cre-sdk"
import { initWorkflow } from "./workflow.js"

export async function main() {
  const runner = await Runner.newRunner()
  await runner.run(initWorkflow)
}
