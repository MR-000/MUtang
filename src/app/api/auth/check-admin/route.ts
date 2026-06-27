import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { identifier } = await req.json();
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!identifier || !adminEmail) {
      return NextResponse.json({ isAdmin: false });
    }

    const isAdmin = identifier === adminEmail;

    return NextResponse.json({
      isAdmin,
      email: isAdmin ? adminEmail : null,
    });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
