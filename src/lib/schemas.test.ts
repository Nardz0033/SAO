import { describe, expect, it } from 'vitest'
import { announcementSchema, appointmentSchema, eventSchema, requestSchema } from './schemas'

describe('request submission validation', () => {
  it('accepts a complete request with a UUID category', () => {
    expect(requestSchema.safeParse({
      category: 'f8f40ec4-1a20-4ed7-92d3-5a221ec0c02b',
      subject: 'Organization registration',
      description: 'Please help us understand the registration requirements.',
    }).success).toBe(true)
  })

  it('rejects missing categories and descriptions that are too short', () => {
    expect(requestSchema.safeParse({ category: '', subject: 'Help', description: 'Short' }).success).toBe(false)
  })
})

describe('staff content validation', () => {
  it('rejects empty announcement content', () => {
    expect(announcementSchema.safeParse({ title: 'Update', content: ' ', category: 'General' }).success).toBe(false)
  })

  it('rejects an event whose end is before its start', () => {
    expect(eventSchema.safeParse({
      title: 'Campus welcome', description: 'A campus community welcome gathering.', location: 'Main quad',
      start_at: '2026-10-20T13:00', end_at: '2026-10-20T12:00', capacity: '40',
    }).success).toBe(false)
  })
})

describe('appointment validation', () => {
  it('requires a meaningful appointment purpose', () => {
    expect(appointmentSchema.safeParse({ purpose: 'Hi' }).success).toBe(false)
    expect(appointmentSchema.safeParse({ purpose: 'Discuss student organization registration' }).success).toBe(true)
  })
})
