const { z } = require("zod");

/** Zod schema for validating login request body */
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Zod schema for validating registration request body */
const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

module.exports = { loginSchema, registerSchema };
