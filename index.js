document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('project-modal');
    const modalBody = document.getElementById('modal-body');
    const closeBtn = document.querySelector('.close-modal');
    const projectCards = document.querySelectorAll('.project-card');

    // OPEN MODAL
    projectCards.forEach(card => {
        card.addEventListener('click', () => {
            const hiddenContent = card.querySelector('.project-info-hidden').innerHTML;
            modalBody.innerHTML = hiddenContent;

            modal.classList.add('active');
            document.body.classList.add('modal-open');
        });
    });

    // CLOSE MODAL FUNCTION
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        setTimeout(() => {
            modalBody.innerHTML = ''; // Clear content after animation
        }, 400);
    };

    // Close via Button
    closeBtn.addEventListener('click', closeModal);

    // Close via Dark Overlay Click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close via Escape Key
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape" && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // OPTIONAL: Smooth Horizontal Dragging for Mouse Users
    const slider = document.querySelector('.projects-horizontal-container');
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => { isDown = false; });
    slider.addEventListener('mouseup', () => { isDown = false; });
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2;
        slider.scrollLeft = scrollLeft - walk;
    });
});