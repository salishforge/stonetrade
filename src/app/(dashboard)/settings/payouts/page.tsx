"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PayoutsPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<{ onboarded: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; accountId: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/stripe/connect/status")
      .then(r => r.json())
      .then(j => {
        setStatus(j.data)
        setLoading(false)
      })
      .catch(() => {
        setError("Failed to load payout status")
        setLoading(false)
      })
  }, [])

  async function handleOnboard() {
    setSubmitting(true)
    const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
    const j = await res.json()
    if (!res.ok) {
      setError(j.error ?? "Failed to create onboarding link")
      setSubmitting(false)
      return
    }
    window.location.href = j.data.url
  }

  const qStatus = searchParams.get("status")

  return (
    <div className="container mx-auto max-w-2xl py-12">
      <h1 className="text-2xl font-bold mb-6">Payouts</h1>

      {qStatus === "refresh" && (
        <p className="text-sm mb-4">Onboarding incomplete — click Continue to resume.</p>
      )}
      {qStatus === "complete" && (
        <p className="text-sm mb-4">Onboarding complete!</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stripe Connect</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : status?.onboarded ? (
            <>
              <ul className="text-sm space-y-1">
                <li>Charges enabled: {status.chargesEnabled ? "Yes" : "No"}</li>
                <li>Payouts enabled: {status.payoutsEnabled ? "Yes" : "No"}</li>
                <li>Details submitted: {status.detailsSubmitted ? "Yes" : "No"}</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">Account ID: {status.accountId}</p>
            </>
          ) : (
            <>
              <p className="text-sm mb-4">Connect your Stripe account to start accepting payments.</p>
              <Button onClick={handleOnboard} disabled={submitting}>
                {submitting ? "Loading…" : (status?.detailsSubmitted ? "Continue onboarding" : "Onboard with Stripe")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive mt-4">{error}</p>}
    </div>
  )
}
