document.addEventListener('DOMContentLoaded', () => {
    const memoInput = document.getElementById('memo-input');
    const saveBtn = document.getElementById('save-btn');
    const memoList = document.getElementById('memo-list');

    // Load memos from LocalStorage
    loadMemos();

    saveBtn.addEventListener('click', () => {
        const text = memoInput.value.trim();
        if (text === '') return;

        const memos = getMemos();
        memos.unshift({ id: Date.now(), text });
        localStorage.setItem('memos', JSON.stringify(memos));

        memoInput.value = '';
        loadMemos();
    });

    function getMemos() {
        const memos = localStorage.getItem('memos');
        return memos ? JSON.parse(memos) : [];
    }

    function loadMemos() {
        const memos = getMemos();
        memoList.innerHTML = '';

        memos.forEach(memo => {
            const li = document.createElement('li');
            li.className = 'memo-item';

            const span = document.createElement('span');
            span.textContent = memo.text;

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', () => {
                deleteMemo(memo.id);
            });

            li.appendChild(span);
            li.appendChild(deleteBtn);
            memoList.appendChild(li);
        });
    }

    function deleteMemo(id) {
        let memos = getMemos();
        memos = memos.filter(memo => memo.id !== id);
        localStorage.setItem('memos', JSON.stringify(memos));
        loadMemos();
    }

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered: ', reg))
                .catch(err => console.log('Service Worker registration failed: ', err));
        });
    }
});