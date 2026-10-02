-- Migration: 20261003020000_sync_image_model_suppliers.sql
-- Fix 7: Update model_suppliers upstream_model for Google image models to match IMAGE_ROUTES in src/services/providerCatalog.ts

update public.model_suppliers
set upstream_model = 'gemini-3.1-flash-lite-image',
    note = 'Google Gemini 3.1 Flash Lite Image 1K'
where model_id = 'img_nano_banana_2_lite' and supplier = 'google';

update public.model_suppliers
set upstream_model = 'gemini-3.1-flash-image',
    note = 'Google Gemini 3.1 Flash Image 1K'
where model_id = 'img_nano_banana_2' and supplier = 'google';

update public.model_suppliers
set upstream_model = 'gemini-3-pro-image',
    note = 'Google Gemini 3 Pro Image 2K'
where model_id = 'img_nano_banana_pro' and supplier = 'google';
