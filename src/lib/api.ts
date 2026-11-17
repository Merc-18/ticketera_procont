import { supabase } from './supabase'
import { createOperations } from './operations'

export const operations = createOperations(supabase)
