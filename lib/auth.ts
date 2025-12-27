import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { NextAuthOptions } from "next-auth"
import EmailProvider from "next-auth/providers/email"
import GoogleProvider from "next-auth/providers/google"
import { prisma } from "./prisma"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM || "noreply@example.com",
      sendVerificationRequest: async ({ identifier, url }) => {
        if (!resend) {
          console.error("RESEND_API_KEY not configured. Email login disabled.")
          return
        }
        
        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || "noreply@example.com",
            to: identifier,
            subject: "Sign in to Ledgr",
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Sign in to Ledgr</h2>
                <p>Click the link below to sign in:</p>
                <p><a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">Sign In</a></p>
                <p>Or copy and paste this URL into your browser:</p>
                <p style="word-break: break-all;">${url}</p>
                <p>This link will expire in 24 hours.</p>
              </div>
            `,
          })
        } catch (error) {
          console.error("Failed to send email:", error)
          throw new Error("Failed to send email")
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
}

