const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');

navToggle.addEventListener('click', () => {
  navMenu.classList.toggle('show');

  // Hide the hamburger when menu is open
  if(navMenu.classList.contains('show')) {
    navToggle.style.display = 'none';
  } else {
    navToggle.style.display = 'block';
  }
});