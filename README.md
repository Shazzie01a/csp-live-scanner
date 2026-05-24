# CSP Live Scanner — Deployment Guide

A live options CSP scanner powered by the Tastytrade API.
Deployed on Vercel (free) — works on iPhone, iPad, desktop.

-----

## What you need

- A GitHub account (free) → github.com
- A Vercel account (free) → vercel.com
- Your Tastytrade username + password

-----

## Step 1 — Create a GitHub account (if you don’t have one)

1. Go to <https://github.com>
1. Click “Sign up”
1. Enter email, password, username
1. Verify your email
1. Done!

-----

## Step 2 — Create a new GitHub repository

1. Go to <https://github.com> and log in
1. Click the “+” icon top right → “New repository”
1. Name it: `csp-live-scanner`
1. Leave it Public (or Private — both work)
1. Do NOT check “Add a README”
1. Click “Create repository”
1. Leave this page open — you’ll need the URL

-----

## Step 3 — Upload the files

1. On your new empty repository page, click “uploading an existing file”
1. Drag and drop ALL the files from this folder
- Make sure to maintain the folder structure!
- pages/ folder with api/ subfolder
- lib/ folder
- styles/ folder
- package.json, next.config.js
1. Scroll down, click “Commit changes”

-----

## Step 4 — Create a Vercel account

1. Go to <https://vercel.com>
1. Click “Sign Up”
1. Choose “Continue with GitHub” — this links your accounts automatically
1. Authorize Vercel to access your GitHub

-----

## Step 5 — Deploy to Vercel

1. On Vercel dashboard, click “Add New Project”
1. Find your `csp-live-scanner` repository and click “Import”
1. Leave all settings as default — Vercel auto-detects Next.js
1. Click “Deploy”
1. Wait about 60 seconds…
1. You’ll get a URL like: <https://csp-live-scanner.vercel.app>

-----

## Step 6 — Add to iPhone home screen

1. Copy your Vercel URL
1. Open Safari on iPhone
1. Paste the URL and load it
1. Tap Share → “Add to Home Screen”
1. Name it “CSP Live” → Add

-----

## How it works

- Login with your Tastytrade credentials
- The app fetches live IV rank, prices, and options chain data
- All 15 tickers are scanned with real premiums and Greeks
- Auto-refresh every 5 minutes during market hours
- Your credentials are NEVER stored — only a session token in your browser

-----

## Updating the app

Whenever Claude updates the code:

1. Download the new files
1. Upload to GitHub (drag and drop, commit)
1. Vercel auto-deploys in ~60 seconds
1. Refresh your iPhone — done!