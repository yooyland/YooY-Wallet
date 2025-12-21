# Firestore Indexes for Room Search

컬렉션: rooms

필드(예시)
- isPublic: boolean
- title: string
- title_lower: string (소문자 제목, prefix 검색용)
- tags: string[] (소문자)
- memberCount: number
- lastActiveAt: number (ms)

권장 인덱스
1) where(isPublic==true) + orderBy(lastActiveAt desc)
2) where(isPublic==true) + title_lower >= q + title_lower <= q\uf8ff + orderBy(lastActiveAt desc)
3) where(isPublic==true) + array-contains(tags, tag) + orderBy(lastActiveAt desc)
4) (선택) 2)+3) 조합 인덱스

주의
- title_lower/ tags는 저장 시 소문자로 동기화
- 보안 규칙에서 isPublic 검사로 공개 방만 검색 허용









