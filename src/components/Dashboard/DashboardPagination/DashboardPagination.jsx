import React from 'react';
import { useEffect } from 'react';
import './DashboardPagination.scss';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';

function DashboardPagination(props) {
    // page number stat
    const [pageNumber, setPageNumber] = React.useState(1);
    // page numbers
    const [pageNumbers, setPageNumbers] = React.useState([]);
    // props contains the total number of documents to be displayed
    // also contains number of pages
    // also contains a function that sets the page number

    //a function that returns <li> elements with the page numbers
    // return only to 4 pages if there are more than 4 pages add ...

    const findPageNumbers = () => {
        let pageNumbers = [];
        for (let i = 1; i <= Math.ceil(props.totalDocuments / props.perPage); i++) {
            if (i <= 4) {
                pageNumbers.push(i);
            }
        }
        console.log(pageNumbers);
        // set the page numbers
        setPageNumbers(pageNumbers);
    };

    // setPrevPageNumber
    const setPrevPageNumber = () => {
        if (pageNumber > 1) {
            setPageNumber(pageNumber - 1);
            props.setPageNumber(pageNumber - 1);

        }
    };

    // setNextPageNumber
    const setNextPageNumber = () => {
        if (pageNumber < Math.ceil(props.totalDocuments / props.perPage)) {
            setPageNumber(pageNumber + 1);
            props.setPageNumber(pageNumber + 1);

        }
    };


    


    const returnPageNumbers = () => {
        return pageNumbers.map((number) => {
            if (number === '...') {
                return (
                    <li key={number} id={number} onClick={() => { setPageNumber(number ); props.setPageNumber(number)}}>
                        {number}
                    </li>
                );
            } else {
                return (
                    <li key={number} className= {`${pageNumber == number ? 'active' : ''}`} id={number} onClick={() => { setPageNumber(number ); props.setPageNumber(number)}}>
                        {number}
                    </li>
                );
            }
        });
    };



    useEffect(() => {
        findPageNumbers();
    }, [props.totalDocuments]);

    return (
        <div className='dashboard_pagination'>
            <ul>
                <li onClick={()=>setPrevPageNumber()}>
                    <HiChevronLeft />
                </li>
                {returnPageNumbers()}
                {props.totalDocuments > 4 ? (
                    <li className= {`${pageNumber > 4 ? 'active' : ''}`} onClick={()=>setNextPageNumber}>
                       {
                        pageNumber>4 ? pageNumber : '...'
                       }
                     
                    </li>
                ) : (
                    ''
                )    
                }
                <li onClick = {()=>setNextPageNumber()}>
                    <HiChevronRight />
                </li>
            </ul>
        </div>
    );
}

export default DashboardPagination;
