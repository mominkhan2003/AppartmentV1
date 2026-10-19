CREATE OR REPLACE FUNCTION public.hub_edit_item(_item_id uuid,_title text,_details text,_payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.hub_items;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
 SELECT * INTO item FROM public.hub_items WHERE id=_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
 IF NOT public.is_admin() AND item.created_by<>auth.uid() THEN RAISE EXCEPTION 'Only the author or administrator can edit this'; END IF;
 IF item.kind='polls' AND EXISTS(SELECT 1 FROM public.hub_responses WHERE item_id=_item_id) AND item.payload->'options' IS DISTINCT FROM _payload->'options' THEN RAISE EXCEPTION 'Poll options cannot change after voting starts'; END IF;
 UPDATE public.hub_items SET title=_title,details=_details,payload=_payload WHERE id=_item_id;
END $$;
REVOKE ALL ON FUNCTION public.hub_edit_item(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hub_edit_item(uuid,text,text,jsonb) TO authenticated;