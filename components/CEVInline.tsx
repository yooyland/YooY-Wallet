import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Image as RNImage } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { getCountryCodeForLanguage } from '@/lib/phone';
import { useAuth } from '@/contexts/AuthContext';

export default function CEVInline() {
  const { language } = usePreferences();
  const { currentUser } = useAuth();
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [chain, setChain] = useState('');
  const [contract, setContract] = useState('');
  const [website, setWebsite] = useState('');
  const [whitepaper, setWhitepaper] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [telegram, setTelegram] = useState('');
  const [twitter, setTwitter] = useState('');
  const [github, setGithub] = useState('');
  const [discord, setDiscord] = useState('');
  const [facebook, setFacebook] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [reddit, setReddit] = useState('');
  const [medium, setMedium] = useState('');
  const [youtube, setYoutube] = useState('');
  const [totalSupply, setTotalSupply] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [tokenStandard, setTokenStandard] = useState('ERC-20');
  const [isMintable, setIsMintable] = useState(false);
  const [isBurnable, setIsBurnable] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<any>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('No file selected');
  const [teamName, setTeamName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [country, setCountry] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');

  const [agreeAccuracy, setAgreeAccuracy] = useState(false);
  const [agreeCompliance, setAgreeCompliance] = useState(false);
  const [agreeNoIllegal, setAgreeNoIllegal] = useState(false);
  const [agreeTrademark, setAgreeTrademark] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState({ notices: 0, receipts: 0, correspondence: 0, rejections: 0, pending: 0 });
  const [listOpen, setListOpen] = useState(false);
  const [listTitle, setListTitle] = useState('');
  const [listItems, setListItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState<boolean>(false);
  const attachInputRef = useRef<any>(null);
  const [attachFileName, setAttachFileName] = useState<string>('');
  const [attachBase64, setAttachBase64] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const key = 'cev_submissions';
      const existing = await AsyncStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      setSubmissions(list);
      const notices = list.filter((x: any) => x.status === 'Notice').length;
      const receipts = list.length;
      const correspondence = list.filter((x: any) => x.status === 'NeedInfo' || x.status === 'InReview').length;
      const rejections = list.filter((x: any) => x.status === 'Rejected').length;
      const pending = list.filter((x: any) => x.status === 'Pending').length;
      setDashboard({ notices, receipts, correspondence, rejections, pending });
    };
    load();
  }, []);

  const openCategory = (key: 'Notices'|'Receipts'|'Correspondence'|'Rejections'|'Pending Filings') => {
    let items: any[] = [];
    if (key === 'Notices') items = submissions.filter((x) => x.status === 'Notice');
    else if (key === 'Receipts') items = submissions;
    else if (key === 'Correspondence') items = submissions.filter((x) => x.status === 'NeedInfo' || x.status === 'InReview');
    else if (key === 'Rejections') items = submissions.filter((x) => x.status === 'Rejected');
    else items = submissions.filter((x) => x.status === 'Pending');
    setListTitle(key);
    setListItems(items);
    setListOpen(true);
    setSelectedItem(null);
  };

  // Auto-fill token metadata when a valid contract address is entered
  useEffect(() => {
    if (!contract || contract.length < 42 || !contract.startsWith('0x')) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        setAutoFilling(true);
        // dynamic import to avoid heavy bundle
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ethersMod = await import('ethers');
        const { JsonRpcProvider, Contract, formatUnits } = ethersMod;
        let rpcUrl: string | undefined;
        try {
          // try to use existing uniswap constants (INFURA url)
          const uniswapConsts = await import('@/lib/uniswap/constants');
          // @ts-ignore
          rpcUrl = uniswapConsts.INFURA_MAINNET_URL as string | undefined;
        } catch {}
        const provider = new JsonRpcProvider(rpcUrl || 'https://cloudflare-eth.com');
        // Minimal ERC20 ABI
        const abi = [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
          'function totalSupply() view returns (uint256)'
        ];
        const c = new Contract(contract, abi, provider as any);
        const [nm, sym, dec, ts] = await Promise.all([
          c.name().catch(() => ''),
          c.symbol().catch(() => ''),
          c.decimals().catch(() => 18),
          c.totalSupply().catch(() => 0n),
        ]);
        if (cancelled) return;
        if (!name) setName(typeof nm === 'string' ? nm : String(nm));
        if (!symbol) setSymbol(typeof sym === 'string' ? sym : String(sym));
        const decNum = typeof dec === 'number' ? dec : Number(dec);
        if (!decimals) setDecimals(String(decNum || 18));
        // human-readable total supply
        let humanTs = '';
        try { humanTs = formatUnits(ts, decNum).toString(); } catch { humanTs = (typeof ts === 'bigint' ? ts.toString() : String(ts)); }
        if (!totalSupply) setTotalSupply(humanTs);
        if (!tokenStandard) setTokenStandard('ERC-20');
        if (!chain) setChain('Ethereum');
      } catch (e) {
        // non-fatal
      } finally {
        if (!cancelled) setAutoFilling(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(tid); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  const refreshFromStorage = async () => {
    const key = 'cev_submissions';
    const existing = await AsyncStorage.getItem(key);
    const list = existing ? JSON.parse(existing) : [];
    setSubmissions(list);
    const notices = list.filter((x: any) => x.status === 'Notice').length;
    const receipts = list.length;
    const correspondence = list.filter((x: any) => x.status === 'NeedInfo' || x.status === 'InReview').length;
    const rejections = list.filter((x: any) => x.status === 'Rejected').length;
    const pending = list.filter((x: any) => x.status === 'Pending').length;
    setDashboard({ notices, receipts, correspondence, rejections, pending });
    // also update currently open list
    if (listOpen && listTitle) openCategory(listTitle as any);
  };

  const onPickLogoWeb = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoBase64(result);
      setSelectedFileName(file.name || '1 file selected');
    };
    reader.readAsDataURL(file);
  };

  const validate = (): string | null => {
    if (!symbol.trim()) return t('symbolRequired', language);
    if (!name.trim()) return t('nameRequired', language);
    if (!contract.trim()) return t('contractRequired', language);
    if (!email.trim()) return t('contactEmailRequired', language);
    if (!country.trim()) return t('countryRequired', language);
    if (!totalSupply.trim()) return t('totalSupply', language) + ' ' + t('required', language);
    if (!decimals.trim()) return t('decimals', language) + ' ' + t('required', language);
    if (!tokenStandard.trim()) return t('tokenStandard', language) + ' ' + t('required', language);
    if (!whitepaper.trim()) return t('whitepaperUrl', language) + ' ' + t('required', language);
    if (!description.trim() || description.trim().length < 30) return t('descriptionMin', language);
    if (!agreeAccuracy || !agreeCompliance || !agreeNoIllegal || !agreeTrademark || !agreePrivacy) return t('complianceAgreeAll', language);
    if (Platform.OS === 'web') {
      if (!logoBase64 && !logoUrl.trim()) return t('logoUploadOrUrl', language);
    } else {
      if (!logoUrl.trim()) return t('logoUrlRequired', language);
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      setSubmitError(err);
      setSubmitInfo(null);
      try { Alert.alert('Invalid submission', err); } catch {}
      return;
    }

    const payload = {
      id: editingId || `${symbol.toUpperCase()}-${Date.now()}`,
      createdAt: Date.now(),
      status: 'Notice',
      symbol: symbol.trim().toUpperCase(),
      name: name.trim(),
      chain: chain.trim(),
      contract: contract.trim(),
      website: website.trim(),
      whitepaper: whitepaper.trim(),
      description: description.trim(),
      email: email.trim(),
      submittedBy: currentUser?.email || 'anonymous',
      contacts: { telegram: telegram.trim(), twitter: twitter.trim(), github: github.trim() },
      org: { teamName: teamName.trim(), contactPerson: contactPerson.trim(), country: country.trim(), company: company.trim(), phone: phone.trim() },
      token: { totalSupply: totalSupply.trim(), decimals: decimals.trim(), standard: tokenStandard.trim(), mintable: isMintable, burnable: isBurnable },
      logo: { url: logoUrl.trim(), base64: logoBase64 },
      agreements: { agreeAccuracy, agreeCompliance, agreeNoIllegal, agreeTrademark, agreePrivacy },
      lastNote: '',
      history: [
        { ts: Date.now(), by: (currentUser?.email || 'user'), action: 'Submitted', note: '' }
      ],
      requests: [],
      attachments: [],
    };

    try {
      const key = 'cev_submissions';
      const existing = await AsyncStorage.getItem(key);
      let list = existing ? JSON.parse(existing) : [];
      if (editingId) {
        list = list.map((x: any) => (x.id === editingId ? { ...x, ...payload } : x));
      } else {
        list.push(payload);
      }
      await AsyncStorage.setItem(key, JSON.stringify(list));
      setSubmissions(list);
      const notices = list.filter((x: any) => x.status === 'Notice').length;
      const receipts = list.length;
      const correspondence = list.filter((x: any) => x.status === 'NeedInfo' || x.status === 'InReview').length;
      const rejections = list.filter((x: any) => x.status === 'Rejected').length;
      const pending = list.filter((x: any) => x.status === 'Pending').length;
      setDashboard({ notices, receipts, correspondence, rejections, pending });
      setSubmitError(null);
      setSubmitInfo(editingId ? (t('submissionUpdated', language) || 'Updated') : (t('submissionPending', language) || 'Submitted'));
      try { Alert.alert(editingId ? t('updated', language) : t('submitted', language), editingId ? t('submissionUpdated', language) : t('submissionPending', language)); } catch {}
      setLogoBase64(null);
      setEditingId(null);
      try {
        await refreshFromStorage();
        openCategory('Notices');
      } catch {}
    } catch (e) {
      // Build detailed, localized error message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyErr: any = e;
      const raw = (anyErr && (anyErr.message || anyErr.reason || anyErr.code)) ? (anyErr.message || anyErr.reason || anyErr.code) : (typeof anyErr === 'string' ? anyErr : JSON.stringify(anyErr));
      let friendly = '';
      const rawLower = (raw || '').toString().toLowerCase();
      if (rawLower.includes('quota') || rawLower.includes('quotaexceeded') || rawLower.includes('ns_error_dom_quota_reached')) {
        friendly = language?.startsWith('ko') ? '브라우저 저장소 용량이 초과되었습니다. 보관함/캐시를 일부 비우고 다시 시도해 주세요.' : 'Storage quota exceeded. Free up some space (cache/local data) and retry.';
      } else if (rawLower.includes('permission') || rawLower.includes('denied') || rawLower.includes('not allowed')) {
        friendly = language?.startsWith('ko') ? '권한 문제로 저장할 수 없습니다. 브라우저 설정을 확인해 주세요.' : 'Permission issue. Please check browser settings and retry.';
      } else if (rawLower.includes('auth') || rawLower.includes('unauth')) {
        friendly = language?.startsWith('ko') ? '로그인이 만료되었을 수 있습니다. 다시 로그인 후 시도해 주세요.' : 'Authentication may have expired. Sign in again and retry.';
      }
      const base = language?.startsWith('ko') ? '신청 저장에 실패했습니다.' : (t('failedToSave', language) || 'Failed to save your submission.');
      const reasonLabel = language?.startsWith('ko') ? '사유' : 'Reason';
      const composed = `${base} ${reasonLabel}: ${friendly || raw || 'Unknown error'}`;
      console.error('CEV submission save failed:', anyErr);
      setSubmitError(composed);
      setSubmitInfo(null);
      try { Alert.alert('Error', composed); } catch {}
    }
  };

  const deleteSubmission = async (id: string) => {
    Alert.alert('Delete', 'Delete this submission?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const key = 'cev_submissions';
        const existing = await AsyncStorage.getItem(key);
        const list = existing ? JSON.parse(existing) : [];
        const next = list.filter((x: any) => x.id !== id);
        await AsyncStorage.setItem(key, JSON.stringify(next));
        await refreshFromStorage();
        setSelectedItem(null);
      } },
    ]);
  };

  const startEdit = (item: any) => {
    setSelectedItem(null);
    // load into form
    setSymbol(item.symbol || '');
    setName(item.name || '');
    setChain(item.chain || '');
    setContract(item.contract || '');
    setWebsite(item.website || '');
    setWhitepaper(item.whitepaper || '');
    setDescription(item.description || '');
    setEmail(item.email || '');
    setTelegram(item.contacts?.telegram || '');
    setTwitter(item.contacts?.twitter || '');
    setGithub(item.contacts?.github || '');
    setCompany(item.org?.company || '');
    setTeamName(item.org?.teamName || '');
    setContactPerson(item.org?.contactPerson || '');
    setCountry(item.org?.country || '');
    setPhone(item.org?.phone || '');
    setTotalSupply(item.token?.totalSupply || '');
    setDecimals(item.token?.decimals || '18');
    setTokenStandard(item.token?.standard || 'ERC-20');
    setIsMintable(!!item.token?.mintable);
    setIsBurnable(!!item.token?.burnable);
    setLogoUrl(item.logo?.url || '');
    setLogoBase64(item.logo?.base64 || null);
    setAgreeAccuracy(!!item.agreements?.agreeAccuracy);
    setAgreeCompliance(!!item.agreements?.agreeCompliance);
    setAgreeNoIllegal(!!item.agreements?.agreeNoIllegal);
    setAgreeTrademark(!!item.agreements?.agreeTrademark);
    setAgreePrivacy(!!item.agreements?.agreePrivacy);
    setEditingId(item.id);
    setListOpen(false);
  };

  return (
    <ThemedView style={styles.wrap}>
      <ThemedText style={styles.title}>CEV - {t('submitYourCoin', language)}</ThemedText>
      {/* 진행 현황 헤더 (블랙 & 골드) */}
      <View style={styles.dashboard}>
        <TouchableOpacity style={styles.dbItem} onPress={() => openCategory('Notices')}>
          <ThemedText style={styles.dbNum}>{dashboard.notices}</ThemedText>
          <ThemedText style={styles.dbLabel}>{t('cevList', language)}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dbItem} onPress={() => openCategory('Receipts')}>
          <ThemedText style={styles.dbNum}>{dashboard.receipts}</ThemedText>
          <ThemedText style={styles.dbLabel}>{t('receipts', language)}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dbItem} onPress={() => openCategory('Correspondence')}>
          <ThemedText style={styles.dbNum}>{dashboard.correspondence}</ThemedText>
          <ThemedText style={styles.dbLabel}>{t('correspondence', language)}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dbItem} onPress={() => openCategory('Rejections')}>
          <ThemedText style={styles.dbNum}>{dashboard.rejections}</ThemedText>
          <ThemedText style={styles.dbLabel}>{t('rejections', language)}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dbItem} onPress={() => openCategory('Pending Filings')}>
          <ThemedText style={styles.dbNum}>{dashboard.pending}</ThemedText>
          <ThemedText style={styles.dbLabel}>{t('pendingFilings', language)}</ThemedText>
        </TouchableOpacity>
      </View>
      {/* Inline list panel below dashboard */}
      {listOpen && (
        <View style={styles.inlinePanel}>
          <View style={styles.inlineHeader}>
            <ThemedText style={{ color:'#FFD700', fontWeight:'800' }}>{listTitle}</ThemedText>
            <TouchableOpacity onPress={()=>{ setListOpen(false); setSelectedItem(null); }}>
              <ThemedText style={{ color:'#fff', fontWeight:'900', fontSize:16 }}>×</ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ padding: 10 }}>
            {!selectedItem && listItems.map((item)=> (
              <TouchableOpacity key={item.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1A1A1A' }} onPress={()=> setSelectedItem(item)}>
                <View style={{ flex:1 }}>
                  <ThemedText style={{ color:'#fff', fontWeight:'700' }}>{item.symbol} · {item.name}</ThemedText>
                  <ThemedText style={{ color:'#888', fontSize:12 }}>{new Date(item.createdAt).toLocaleString()}</ThemedText>
                </View>
                <View style={[
                  styles.badge,
                  item.status === 'Pending' ? styles.badgePending : item.status === 'Rejected' ? styles.badgeRejected : styles.badgeDefault
                ]}>
                  <ThemedText style={[
                    styles.badgeText,
                    item.status === 'Pending' ? styles.badgeTextPending : item.status === 'Rejected' ? styles.badgeTextRejected : styles.badgeTextDefault
                  ]}>{item.status === 'Pending' ? t('pending', language) : item.status === 'Rejected' ? t('rejected', language) : t('cevList', language)}</ThemedText>
                </View>
              </TouchableOpacity>
            ))}
            {selectedItem && (
              <View style={{ gap:8 }}>
                <ThemedText style={{ color:'#fff', fontWeight:'800' }}>{selectedItem.symbol} · {selectedItem.name}</ThemedText>
                <ThemedText style={{ color:'#bbb' }}>Status: {selectedItem.status}</ThemedText>
                <ThemedText style={{ color:'#bbb' }}>Created: {new Date(selectedItem.createdAt).toLocaleString()}</ThemedText>
                {selectedItem.logo?.url ? (
                  <View style={{ marginTop:6 }}>
                    <ThemedText style={{ color:'#ddd' }}>Logo</ThemedText>
                    <RNImage source={{ uri: selectedItem.logo.url }} style={{ width:84, height:84, borderRadius:10, marginTop:4 }} />
                  </View>
                ) : null}
                <View style={{ flexDirection:'row', gap:16, marginTop:6 }}>
                  <View style={{ flex:1 }}>
                    <ThemedText style={{ color:'#ddd', fontWeight:'700' }}>Token</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Symbol: {selectedItem.symbol}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Name: {selectedItem.name}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Chain: {selectedItem.chain || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Contract: {selectedItem.contract}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>TotalSupply: {selectedItem.token?.totalSupply}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Decimals: {selectedItem.token?.decimals}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Standard: {selectedItem.token?.standard}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Mintable: {selectedItem.token?.mintable?'Yes':'No'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Burnable: {selectedItem.token?.burnable?'Yes':'No'}</ThemedText>
                  </View>
                  <View style={{ flex:1 }}>
                    <ThemedText style={{ color:'#ddd', fontWeight:'700' }}>Project</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Team: {selectedItem.org?.teamName || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Contact: {selectedItem.org?.contactPerson || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Company: {selectedItem.org?.company || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Country: {selectedItem.org?.country || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Phone: {selectedItem.org?.phone || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Website: {selectedItem.website || '-'}</ThemedText>
                    <ThemedText style={{ color:'#eee', fontSize:12 }}>Whitepaper: {selectedItem.whitepaper || '-'}</ThemedText>
                  </View>
                </View>
                <ThemedText style={{ color:'#ddd', marginTop:6 }}>Description</ThemedText>
                <ThemedText style={{ color:'#fff' }}>{selectedItem.description}</ThemedText>
                <ThemedText style={{ color:'#ddd', marginTop:6 }}>Contacts</ThemedText>
                <ThemedText style={{ color:'#eee', fontSize:12 }}>Telegram: {selectedItem.contacts?.telegram || '-'}</ThemedText>
                <ThemedText style={{ color:'#eee', fontSize:12 }}>Twitter/X: {selectedItem.contacts?.twitter || '-'}</ThemedText>
                <ThemedText style={{ color:'#eee', fontSize:12 }}>Github: {selectedItem.contacts?.github || '-'}</ThemedText>
                {selectedItem.lastNote ? (<ThemedText style={{ color:'#CFCFCF', fontSize:12, marginTop:6 }}>Admin Note: {selectedItem.lastNote}</ThemedText>) : null}
                {Array.isArray(selectedItem.history) && selectedItem.history.length>0 && (
                  <View style={{ marginTop:6 }}>
                    <ThemedText style={{ color:'#ddd', fontWeight:'700' }}>History</ThemedText>
                    {selectedItem.history.slice(0,5).map((h:any, idx:number)=> (
                      <ThemedText key={idx} style={{ color:'#eee', fontSize:12 }}>• [{new Date(h.ts).toLocaleString()}] {h.by}: {h.action}{h.note?` - ${h.note}`:''}</ThemedText>
                    ))}
                  </View>
                )}

                {/* Admin requirements */}
                {!!(Array.isArray(selectedItem.requests) && selectedItem.requests.length) && (
                  <View style={{ marginTop:6 }}>
                    <ThemedText style={{ color:'#ddd', fontWeight:'700' }}>Requirements</ThemedText>
                    <View style={{ borderWidth:1, borderColor:'#1A1A1A', borderRadius:8, overflow:'hidden', marginTop:4 }}>
                      {selectedItem.requests.map((r:any, idx:number)=> (
                        <View key={idx} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#111' }}>
                          <ThemedText style={{ color:'#eee', fontSize:12 }}>{r.type==='deposit'?'[Deposit]':''} {r.note || ''} {r.amount?`(${r.amount})`:''}</ThemedText>
                          <ThemedText style={{ color:'#777', fontSize:10 }}>{new Date(r.ts||Date.now()).toLocaleString()}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Upload attachment */}
                {Platform.OS === 'web' ? (
                  <View style={{ marginTop:6 }}>
                    {/* @ts-ignore */}
                    <input
                      ref={attachInputRef}
                      type="file"
                      onChange={(e)=>{
                        const file = e.target?.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ()=> { setAttachBase64(reader.result as string); setAttachFileName(file.name||'attachment'); };
                        reader.readAsDataURL(file);
                      }}
                      style={{ display:'none' }}
                    />
                    <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                      <TouchableOpacity style={styles.fileButton} onPress={()=> attachInputRef.current?.click()}>
                        <ThemedText style={[styles.submitText, styles.miniText]}>File</ThemedText>
                      </TouchableOpacity>
                      <ThemedText style={styles.fileName}>{attachFileName || t('noFileSelected', language)}</ThemedText>
                      <View style={{ flex:1 }} />
                      <TouchableOpacity style={styles.uploadIconBtn} onPress={async()=>{
                        try {
                          if (!attachBase64) return;
                          const key = 'cev_submissions';
                          const raw = await AsyncStorage.getItem(key);
                          const list = raw ? JSON.parse(raw) : [];
                          const next = list.map((it:any)=>{
                            if (it.id !== selectedItem.id) return it;
                            const atts = Array.isArray(it.attachments)? it.attachments: [];
                            atts.unshift({ by: (currentUser?.email||'me'), name: attachFileName||'attachment', base64: attachBase64, ts: Date.now() });
                            return { ...it, attachments: atts };
                          });
                          await AsyncStorage.setItem(key, JSON.stringify(next));
                          setSubmissions(next);
                          setSelectedItem(next.find((x:any)=>x.id===selectedItem.id));
                          setAttachBase64(null); setAttachFileName('');
                          Alert.alert('업로드','첨부를 추가했습니다.');
                        } catch {}
                      }}>
                        <MaterialIcons name="file-upload" size={16} color="#000" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {!!(Array.isArray(selectedItem.attachments) && selectedItem.attachments.length) && (
                  <View style={{ marginTop:6 }}>
                    <ThemedText style={{ color:'#ddd', fontWeight:'700' }}>Attachments</ThemedText>
                    {selectedItem.attachments.slice(0,3).map((a:any, idx:number)=> (
                      <ThemedText key={idx} style={{ color:'#eee', fontSize:12 }}>• {a.name} ({new Date(a.ts).toLocaleString()})</ThemedText>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection:'row', gap:10, marginTop:6, justifyContent:'center' }}>
                  <TouchableOpacity style={[styles.miniBtn, { backgroundColor:'#2A2A2A', borderWidth:1, borderColor:'transparent' }]} onPress={()=> setSelectedItem(null)}>
                    <ThemedText style={[styles.submitText, styles.miniText, { color:'#fff' }]}>Back</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniBtn, { backgroundColor:'#F44336', borderWidth:1, borderColor:'transparent' }]} onPress={()=> deleteSubmission(selectedItem.id)}>
                    <ThemedText style={[styles.submitText, styles.miniText, { color:'#000' }]}>Delete</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniBtn, { backgroundColor:'#FFD700', borderWidth:1, borderColor:'transparent' }]} onPress={()=> startEdit(selectedItem)}>
                    <ThemedText style={[styles.submitText, styles.miniText]}>Edit</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true} persistentScrollbar={true} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Required Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{t('required', language)}</ThemedText>
          <View style={styles.row}><ThemedText style={styles.label}>{t('symbol', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={symbol} onChangeText={setSymbol} placeholder="YOY" placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('tokenName', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={name} onChangeText={setName} placeholder="YooY Land" placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('contract', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={contract} onChangeText={setContract} placeholder="0x..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('totalSupply', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput value={totalSupply} onChangeText={setTotalSupply} placeholder="1000000000" placeholderTextColor="#666" keyboardType="numeric" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('decimals', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput value={decimals} onChangeText={setDecimals} placeholder="18" placeholderTextColor="#666" keyboardType="numeric" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('tokenStandard', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput value={tokenStandard} onChangeText={setTokenStandard} placeholder="ERC-20 / BEP-20" placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('whitepaperUrl', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={whitepaper} onChangeText={setWhitepaper} placeholder="https://" placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('country', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={country} onChangeText={setCountry} placeholder="Korea, USA, ..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('contactEmail', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={email} onChangeText={setEmail} placeholder="admin@project.io" placeholderTextColor="#666" keyboardType="email-address" style={styles.input}/></View>

          {Platform.OS === 'web' ? (
            <View style={styles.row}>
              <ThemedText style={styles.label}>{t('logoUpload', language)} (PNG/JPG) <ThemedText style={styles.req}>*</ThemedText></ThemedText>
              {/* @ts-ignore */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                aria-label={t('chooseFile', language)}
                onChange={(e) => {
                  const file = e.target?.files?.[0];
                  if (file) onPickLogoWeb(file);
                  else setSelectedFileName('No file selected');
                }}
                style={{ display: 'none' }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity style={styles.fileButton} onPress={() => fileInputRef.current?.click()}>
                  <ThemedText style={styles.fileButtonText}>File</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.fileName}>{selectedFileName || t('noFileSelected', language)}</ThemedText>
              </View>
              <ThemedText style={styles.hint}>{logoBase64 ? t('logoSelected', language) : t('orProvideUrl', language)}</ThemedText>
            </View>
          ) : null}
          <View style={styles.row}><ThemedText style={styles.label}>{t('logoUrl', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={logoUrl} onChangeText={setLogoUrl} placeholder="https://.../logo.png" placeholderTextColor="#666" style={styles.input}/></View>

          <View style={styles.row}><ThemedText style={styles.label}>{t('projectDescription', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText><TextInput selectTextOnFocus value={description} onChangeText={setDescription} placeholder={t('projectDescriptionPh', language)} placeholderTextColor="#666" style={[styles.input, { height: 120 }]} multiline/></View>

          <ThemedText style={[styles.label, { marginTop: 10 }]}>{t('complianceAck', language)} <ThemedText style={styles.req}>*</ThemedText></ThemedText>
          <View style={styles.rowInline}>
            <TouchableOpacity style={[styles.checkbox, agreeAccuracy && styles.checkboxOn]} onPress={() => setAgreeAccuracy(v => !v)}><ThemedText style={styles.checkboxText}>{agreeAccuracy ? '✓' : ''}</ThemedText></TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('infoAccurate', language)}</ThemedText>
          </View>
          <View style={styles.rowInline}>
            <TouchableOpacity style={[styles.checkbox, agreeCompliance && styles.checkboxOn]} onPress={() => setAgreeCompliance(v => !v)}><ThemedText style={styles.checkboxText}>{agreeCompliance ? '✓' : ''}</ThemedText></TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('compliesLaws', language)}</ThemedText>
          </View>
          <View style={styles.rowInline}>
            <TouchableOpacity style={[styles.checkbox, agreeNoIllegal && styles.checkboxOn]} onPress={() => setAgreeNoIllegal(v => !v)}><ThemedText style={styles.checkboxText}>{agreeNoIllegal ? '✓' : ''}</ThemedText></TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('noIllegal', language)}</ThemedText>
          </View>
          <View style={styles.rowInline}>
            <TouchableOpacity style={[styles.checkbox, agreeTrademark && styles.checkboxOn]} onPress={() => setAgreeTrademark(v => !v)}><ThemedText style={styles.checkboxText}>{agreeTrademark ? '✓' : ''}</ThemedText></TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('rightsTrademark', language)}</ThemedText>
          </View>
          <View style={styles.rowInline}>
            <TouchableOpacity style={[styles.checkbox, agreePrivacy && styles.checkboxOn]} onPress={() => setAgreePrivacy(v => !v)}><ThemedText style={styles.checkboxText}>{agreePrivacy ? '✓' : ''}</ThemedText></TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('agreePrivacy', language)}</ThemedText>
          </View>
        </View>

        {/* Optional Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{t('optional', language)}</ThemedText>
          <View style={styles.row}><ThemedText style={styles.label}>{t('chain', language)}</ThemedText><TextInput selectTextOnFocus value={chain} onChangeText={setChain} placeholder="Ethereum, BSC, etc." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('teamProject', language)}</ThemedText><TextInput selectTextOnFocus value={teamName} onChangeText={setTeamName} placeholder={t('teamProjectPlaceholder', language)} placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('contactPerson', language)}</ThemedText><TextInput selectTextOnFocus value={contactPerson} onChangeText={setContactPerson} placeholder="John Doe" placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('companyLegalEntity', language)}</ThemedText><TextInput selectTextOnFocus value={company} onChangeText={setCompany} placeholder={t('companyPlaceholder', language)} placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('phone', language)}</ThemedText><TextInput selectTextOnFocus value={phone} onChangeText={setPhone} placeholder={`${getCountryCodeForLanguage(language)} 10-0000-0000`} placeholderTextColor="#666" keyboardType="phone-pad" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('website', language)}</ThemedText><TextInput selectTextOnFocus value={website} onChangeText={setWebsite} placeholder="https://" placeholderTextColor="#666" style={styles.input}/></View>

          <View style={[styles.row, styles.rowInline]}>
            <TouchableOpacity style={[styles.checkbox, isMintable && styles.checkboxOn]} onPress={() => setIsMintable(v => !v)}>
              <ThemedText style={styles.checkboxText}>{isMintable ? '✓' : ''}</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('mintable', language)}</ThemedText>
            <View style={{ width: 16 }} />
            <TouchableOpacity style={[styles.checkbox, isBurnable && styles.checkboxOn]} onPress={() => setIsBurnable(v => !v)}>
              <ThemedText style={styles.checkboxText}>{isBurnable ? '✓' : ''}</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.checkboxLabel}>{t('burnable', language)}</ThemedText>
          </View>

          <View style={styles.row}><ThemedText style={styles.label}>{t('telegram', language)}</ThemedText><TextInput selectTextOnFocus value={telegram} onChangeText={setTelegram} placeholder="https://t.me/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('twitterX', language)}</ThemedText><TextInput selectTextOnFocus value={twitter} onChangeText={setTwitter} placeholder="https://x.com/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('github', language)}</ThemedText><TextInput selectTextOnFocus value={github} onChangeText={setGithub} placeholder="https://github.com/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('discord', language)}</ThemedText><TextInput selectTextOnFocus value={discord} onChangeText={setDiscord} placeholder="https://discord.gg/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('facebook', language)}</ThemedText><TextInput selectTextOnFocus value={facebook} onChangeText={setFacebook} placeholder="https://facebook.com/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('instagram', language)}</ThemedText><TextInput selectTextOnFocus value={instagram} onChangeText={setInstagram} placeholder="https://instagram.com/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('linkedin', language)}</ThemedText><TextInput selectTextOnFocus value={linkedin} onChangeText={setLinkedin} placeholder="https://linkedin.com/company/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('reddit', language)}</ThemedText><TextInput selectTextOnFocus value={reddit} onChangeText={setReddit} placeholder="https://reddit.com/r/..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('medium', language)}</ThemedText><TextInput selectTextOnFocus value={medium} onChangeText={setMedium} placeholder="https://medium.com/@..." placeholderTextColor="#666" style={styles.input}/></View>
          <View style={styles.row}><ThemedText style={styles.label}>{t('youtube', language)}</ThemedText><TextInput selectTextOnFocus value={youtube} onChangeText={setYoutube} placeholder="https://youtube.com/@..." placeholderTextColor="#666" style={styles.input}/></View>
        </View>

        <TouchableOpacity style={styles.submit} onPress={submit}><ThemedText style={styles.submitText}>{editingId ? t('saveChanges', language) : t('submit', language)}</ThemedText></TouchableOpacity>
        {submitError ? (<ThemedText style={{ color:'#FF6B6B', marginTop:6 }}>{submitError}</ThemedText>) : null}
        {submitInfo ? (<ThemedText style={{ color:'#9CCC65', marginTop:6 }}>{submitInfo}</ThemedText>) : null}

            {submissions.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <ThemedText style={styles.subTitle}>{t('submissions', language)}</ThemedText>
            {submissions.map((s) => (
              <View key={s.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.itemTitle}>{s.symbol} · {s.name}</ThemedText>
                  <ThemedText style={styles.itemMeta}>{new Date(s.createdAt).toLocaleString()}</ThemedText>
                </View>
                <View style={[
                  styles.badge,
                  s.status === 'Pending' ? styles.badgePending : s.status === 'Rejected' ? styles.badgeRejected : styles.badgeDefault
                ]}>
                  <ThemedText style={[
                    styles.badgeText,
                    s.status === 'Pending' ? styles.badgeTextPending : s.status === 'Rejected' ? styles.badgeTextRejected : styles.badgeTextDefault
                  ]}>{s.status === 'Pending' ? t('pending', language) : s.status === 'Rejected' ? t('rejected', language) : t('cevList', language)}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      {/* (old center modal removed; replaced by inline panel above) */}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', padding: 16 },
  title: { color: '#FFF', fontWeight: '700', marginBottom: 8, fontSize: 12 },
  subTitle: { color: '#FFF', fontWeight: '700', marginBottom: 8, marginTop: 8 },
  row: { marginBottom: 10 },
  rowInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { color: '#FFF', marginBottom: 6 },
  req: { color: '#FFD700', fontWeight: '700' },
  section: { borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#0E0E0E' },
  sectionTitle: { color: '#FFD700', fontWeight: '800', marginBottom: 8, fontSize: 12 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  hint: { color: '#AAA', fontSize: 12, marginTop: 6 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: '#555', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: 'transparent' },
  checkboxOn: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  checkboxText: { color: '#000', fontWeight: '700' },
  checkboxLabel: { color: '#FFF' },
  submit: { backgroundColor: '#FFD700', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#000', fontWeight: '700' },
  miniBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999, minWidth: 84, alignItems: 'center' },
  miniText: { fontSize: 12 },
  dashboard: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10, justifyContent: 'space-between' },
  dbItem: { flex: 1, alignItems: 'center', minWidth: 56 },
  dbNum: { color: '#00E5FF', fontWeight: '800', fontSize: 16 },
  dbLabel: { color: '#EEE', fontSize: 9 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  itemTitle: { color: '#FFF', fontWeight: '700' },
  itemMeta: { color: '#888', fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginLeft: 10, backgroundColor: 'transparent', borderWidth: 1 },
  badgeText: { fontWeight: '700', fontSize: 11 },
  badgePending: { borderColor: '#FFD700' },
  badgeRejected: { borderColor: '#FF5C5C' },
  badgeDefault: { borderColor: '#9BA1A6' },
  badgeTextPending: { color: '#FFD700' },
  badgeTextRejected: { color: '#FF5C5C' },
  badgeTextDefault: { color: '#CFCFCF' },
  inlinePanel: { borderWidth:2, borderColor:'#FFD700', borderRadius:12, backgroundColor:'#0B0B0B', marginBottom: 12, overflow:'hidden' },
  inlineHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#FFD700' },
  fileButton: { backgroundColor:'#FFD700', paddingHorizontal:16, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#FFC107', minWidth:84, alignItems:'center' },
  fileButtonText: { color:'#000', fontWeight:'800' },
  fileName: { color:'#DDD', marginLeft:10 },
  uploadIconBtn: { backgroundColor:'#FFD700', borderRadius:999, paddingVertical:6, paddingHorizontal:10, borderWidth:1, borderColor:'transparent', alignItems:'center', justifyContent:'center' },
});


