import {supabase} from './supabase-client.js';
import {renderBanners} from './banner-view.js?v=digest1';
const section=document.getElementById('homeDigest');
try{const {data,error}=await supabase.rpc('list_home_banners');if(!error&&Array.isArray(data)&&data.length){renderBanners(document.getElementById('homeBannerCards'),data);section.hidden=false;}}catch{}
