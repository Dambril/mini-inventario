// Cliente de Supabase con la URL y la llave pública que entrega el servidor en /config.js.
import { createClient } from '@supabase/supabase-js';
import config from '/config.js';

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
