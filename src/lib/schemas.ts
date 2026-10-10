import { z } from 'zod'

export const requestSchema = z.object({
  category: z.string().uuid('Choose a service category.'),
  subject: z.string().trim().min(3, 'Add a short subject.').max(180, 'Subject must be 180 characters or fewer.'),
  description: z.string().trim().min(10, 'Please add a little more detail.').max(10000, 'Description is too long.'),
})

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(10).max(20000),
  category: z.string().trim().min(1).max(80),
})

export const appointmentSchema = z.object({
  purpose: z.string().trim().min(4).max(180),
  notes: z.string().max(2000).optional(),
})

export const eventSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(10000),
  location: z.string().trim().min(2).max(220),
  start_at: z.string().min(1),
  end_at: z.string().min(1),
  registration_deadline: z.string().optional(),
  capacity: z.string().optional(),
}).refine(value => new Date(value.end_at) > new Date(value.start_at), { message: 'End time must be after the start time.', path: ['end_at'] })
  .refine(value => !value.registration_deadline || new Date(value.registration_deadline) <= new Date(value.start_at), { message: 'Registration deadline must be before the event starts.', path: ['registration_deadline'] })
  .refine(value => !value.capacity || (/^\d+$/.test(value.capacity) && Number(value.capacity) > 0), { message: 'Capacity must be a positive whole number.', path: ['capacity'] })
